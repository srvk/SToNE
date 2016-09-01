CHANGES to make to port stone interface to a new recipe:

The main script for the web interface is app.js. You can run the web server by simply typing 'nodejs app.js &' from the commandline. 

At the start of each training, app.js calls "master_reset.sh" (which 'resets' the training setup to the intial state) and then calls "master_script.sh <training_status>" where training_status is retrieved from user.json and is used to start from a particular step such as "tri2b_alignments" rather than from the beginning. 

Description of different files:
1. user.json: training_status (last complete step before VM crashed), experiment_status (this enables the various tabs in the interface, for ex. 4 means first 4 tabs will be enabled)
2. results.json: stores the training parameter values and WERs of previous training runs. You can select any previous training run from the "WER results" page (which reads from results.json) and the stored parameter values will be loaded into the training tabs.
3. port.json: contains port/url settings for nodejs server.

First we need to create the master_*.sh scripts that app.js needs:
0. Copy over master_*.sh, score.sh scripts from CSLU setup. Refactor the new run.sh code to the CSLU master_script.sh format.
1. the echo lines (such as: echo "data,preparation,started") are important as these are how app.js keeps tab on the training progress. Note "echo" has been redefined in master_config to print to stderr.
2. Any change in the sequence of training steps at the end of master_script.sh should also be reflected in app.js (where the same sequence is harcoded).
3. master_script.sh depends on master_config.sh and /node/stone/node_config.sh, make sure the default training parameters there (default beam, #gaussian, #states and other values) are what need to be used for the new recipe. These default parameters are also hardcoded in params.html and app.js. Also initially we need to clear results.json, otherwise app.js will load parameter values from previous CSLU training runs stored there.

Other files that might need to be changed:
1. Data preparation files such as utils/prepare_*.sh or local/prepare_*.sh might need to be changed if needed.
2. change train/mono.sh to accept different beam and retrybeam values if it doesn't do that already.

Adding new problems and solutions:
All you need to do is add a new entry to knknowledgebase.json. You will also need to edit the "updatepage" javascript function in params.html (all the param IDs change everytime you add a new tab, you can hover over the "Apply" button to see what ID each solution has). Also will need to change the html to display a popup for additional options relevant to the solution. If you specify a "step" that hasn't been used yet, a new tab will be created in the interface. You will then need to modify app.js, params.html etc. to do the right thing (which ultimately involves writing a flag to node_config.sh and running master_script.sh) if that solution is applied.
