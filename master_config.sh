#!/bin/bash

# Data directories
train_mono=data/train_9_10
test_mono=data/test_9_10
train=data/train
test=data/test
dev=data/dev

# Dictionary directories (has to be one)
dictionary=data/local/dict_phn

# Language model directories
lang_model=data/local/lang
lang=data/lang
lang_test=data/lang_test

# Training parameters
states=1800
gaussians=9000

# Beam values for mono model
mono_beam=100
mono_retrybeam=300

# Language model parameters
lmoptimize=""

# Decoding parameters
min_lmwt=5
max_lmwt=10

## Utility variables
nj=1    # How many parallelized jobs do we want?
script_status=script_status.log
verbose_log=verbose_output.log

## Optimization variables
apply_fmllr="No"
cmvn_switch="--fake"

# Override all echo commands to output to status_update file.
echo() {
    builtin echo $1 >&2;
}
