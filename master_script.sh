#!/bin/bash

. cmd.sh
# note master_config.sh does a sneaky hack redirecting all echo cmds to stderr
# this stream is meant to contain status messages that get read by app.js
. master_config.sh
. /node/stone/node_config.sh

# Specify network structure and generate the network topology
input_feat_dim=120   # dimension of the input features; we will use 40-dimensional fbanks with deltas and double deltas
lstm_layer_num=5     # number of LSTM layers
lstm_cell_dim=320    # number of memory cells in every LSTM layer
dir=exp/train_phn_l${lstm_layer_num}_c${lstm_cell_dim}

GRAPH_DIR=/home/vagrant/eesen/asr_egs/tedlium/v2-30ms/data/lang_phn_test
MODEL_DIR=/home/vagrant/eesen/asr_egs/tedlium/v2-30ms/exp/train_phn_l${lstm_layer_num}_c${lstm_cell_dim}
ACWT=0.6

data_preparation() {
  # We assume the data is already prepared!
  echo "data,preparation,started"

  # Use the same datap prepatation script from Kaldi
  local/tedlium_prepare_data.sh 2>&1 || exit 1
}

language_preparation() {
  echo "language,preparation,started"

  # Construct the phoneme-based lexicon
  local/tedlium_prepare_phn_dict.sh 2>&1 || exit 1
}

dictionary_preparation() {
  echo "dictionary,preparation,started"
  # Compile the lexicon and token FSTs
  utils/ctc_compile_dict_token.sh data/local/dict_phn data/local/lang_phn_tmp data/lang_phn 2>&1 || exit 1
}

graph_composition() {
  echo "graph,composition,started"
  # Compose the decoding graph
  # this step may require > 8GB RAM
  local/tedlium_decode_graph.sh data/lang_phn 2>&1 || exit 1
}

feature_extraction() {
  fbankdir=fbank

  # Generate the fbank features; by default 40-dimensional fbanks on each frame
  for set in train test dev; do
    echo "feature,extraction,started:$set"
    # Ram requirements slightly exceed the formula #CPUs x 4
    # The nj setting of 7 fits on a machine with 8 cpus giving RAM to spare
    steps/make_fbank.sh --cmd "$train_cmd" --nj $nj data/$set exp/make_fbank/$set $fbankdir 2>&1 || exit 1
    utils/fix_data_dir.sh data/$set 2>&1 || exit 1
    steps/compute_cmvn_stats.sh data/$set exp/make_fbank/$set $fbankdir 2>&1 || exit 1
  done
}

data_formatting() {
  echo "data,formatting,started";
#  local/cslu_train_lms.sh $dictionary $lmoptimize 2>&1
#  local/cslu_format_data.sh 2>&1
  # Split the whole training data into training (95%) and cross-validation (5%) sets
  utils/subset_data_dir_tr_cv.sh --cv-spk-percent 5 data/train data/train_tr95 data/train_cv05 2>&1
}

nnet_preparation() {
  echo "nnet,preparation,started";

  mkdir -p $dir

  target_num=`cat data/lang_phn_test/units.txt | wc -l`; target_num=$[$target_num+1]; #  #targets = #labels + 1 (the blank)

  # Output the network topology
  utils/model_topo.py --input-feat-dim $input_feat_dim --lstm-layer-num $lstm_layer_num \
    --lstm-cell-dim $lstm_cell_dim --target-num $target_num \
    --fgate-bias-init 1.0 > $dir/nnet.proto 2>&1

  # Label sequences; simply convert words into their label indices
  utils/prep_ctc_trans.py data/lang_phn/lexicon_numbers.txt data/train_tr95/text "<UNK>" | gzip -c - > $dir/labels.tr.gz
  utils/prep_ctc_trans.py data/lang_phn/lexicon_numbers.txt data/train_cv05/text "<UNK>" | gzip -c - > $dir/labels.cv.gz
}

nnet_training() {
  echo "nnet,training,started";

  # Train the network with CTC. Refer to the script for details about the arguments
  steps/train_ctc_parallel.sh --add-deltas true --num-sequence 20 --frame-num-limit 15000 \
    --learn-rate 0.00004 --report-step 1000 --halving-after-epoch 12 \
    --feats-tmpdir $dir/XXXXX \
    data/train_tr95 data/train_cv05 $dir 2>&1
}

addoov_dictionary() {
  if [[ $generateoovwords = 'yes' ]]; then
    ./local/cslu_data_oov.py $train $dictionary
    if [[ $dictionary = 'data/local/dict_swbd' ]]; then
      echo "addoov,dictionary,started,swbd"
      cp data/local/dict_swbd/dict.oov.txt data/local/dict_swbd/dict.txt
    elif [[ $dictionary = 'data/local/dict_cmu' ]]; then
      echo "addoov,dictionary,started,cmu"
      cp data/local/dict_cmu/dict.oov.txt data/local/dict_cmu/dict.txt
    fi
  fi
}

nnet_decode () {
  echo "nnet,decode,started";

  # decoding
  # er1k: lowered nj from the defaults in this script
  # not enough RAM on AWS g2 compute node
  steps/decode_ctc_lat_model.sh --cmd "$decode_cmd" --nj $nj --beam 17.0 --lattice_beam 8.0 --max-active 5000 --acwt $ACWT \
    $GRAPH_DIR data/dev $dir/decode_dev $MODEL_DIR || exit 1;
  steps/decode_ctc_lat_model.sh --cmd "$decode_cmd" --nj $nj --beam 17.0 --lattice_beam 8.0 --max-active 5000 --acwt $ACWT \
    $GRAPH_DIR data/test $dir/decode_test $MODEL_DIR || exit 1;
}


kaldi_recipe() {
  resume_state=false;
  if [[ $1 == "" ]];then
    resume_state=true;
  fi
  methods=(data_preparation language_preparation dictionary_preparation graph_composition feature_extraction data_formatting nnet_preparation nnet_training nnet_decode)
  for method in "${methods[@]}"; do
    if [[ $method = $1 ]]; then
      resume_state=true;
    fi
    if [[ $resume_state = true ]]; then
      $method
    fi
  done;
  echo "kaldi,recipe,completed"
}
kaldi_recipe $1
