var url = require("url");
var fs = require("fs");
var child_process = require("child_process");
var express = require("express");
var portconf = require("./port.json")
var app = express();
var server = require("http").createServer(app).listen(portconf.sockets);
var io = require("socket.io").listen(server);
var runscript;               // The kaldi recipe state.
var aggregatelogs = "";      // Aggregate logs from the current training.
var params = {};			 // Training parameters
var userdata = {};     		 // User variables
var params_info = {
    "train":["Input"], 
    "test":["Input"], 
    "lexicon":['Input'],
    "min_lmwt":['Tune Parameters','Change decoding range','Modify LM weight','5'],
    "max_lmwt":['Tune Parameters','Change decoding range','Modify LM weight','10'],
};

var training_states = ["data_preparation",
		       "language_preparation",
		       "dictionary_preparation",
		       "graph_composition",
		       "feature_extraction",
		       "data_formatting",
		       "nnet_preparation",
		       "nnet_training",
		       "nnet_decode",
		       "kaldi_recipe"];

var eesen_home = "/home/vagrant/eesen/asr_egs/tedlium/v2-30ms";
var master_script = eesen_home + "/master_script.sh";
var reset_script  = eesen_home + "/master_reset.sh";
var working_dir   = eesen_home + "/";
var score_script  = eesen_home + "/score.sh";

app.use(app.router);
app.use(express.static(__dirname));

io.set('log level', 1);      // '0' - error, '1' - warn, '2' - info, '3' - debug
io.sockets.on('connection', function (socket) {
    if (typeof(runscript) === 'undefined')
      io.sockets.emit('TRAININGSTATUS', {data: 'off'});
    else {
    	io.sockets.emit('TRAININGSTATUS', {data: 'on'});
        var training_status = ["Training","started"]
        if (userdata.hasOwnProperty("training_status"))
     	  training_status = userdata.training_status.split("_");
    	training_status.push("started");
    	var total_training_states = training_states.length;

    	socket.emit('STATUS', {data: training_status.join(), progress: training_states.indexOf
    		(userdata.training_status), total: total_training_states});
    	socket.emit('LOGS', {data: aggregatelogs});
    }
    logger(socket.id+",Browser session has been opened");
    socket.emit("CURRENT_RESULT",{id: userdata.training_id});
    socket.emit("EXPERIMENTSTATUS",{id: userdata.experiment_status});
    socket.on('LOGGER', function(data) {
		logger(socket.id+','+data.log);
    });
    socket.on('disconnect', function () {
    	logger(socket.id+',Browser session has been closed');
  	});
});

// This is the "Error Analysis" stuff we want
// need special python packages for this to work, do we need??
app.get('/applyregression', function(req, res) {
    regressionscript = child_process.spawn('bash',[eesen_home+'/unified/RunMe.sh','--csv'],
					   {'cwd':eesen_home+'/unified'});
    regressionscript.stdout.on('data', function(data) {
	console.log(data.toString());
    })
    regressionscript.on('close', function(data) {
	var output = fs.readFileSync(eesen_home+'/unified/regression.txt')
	io.sockets.emit("REGRESSION", {"data":output});
    })
    res.send("success");
});

app.get('/selectedproblems', function(req, res) {
	var questions = {};
	for (el in params) {
		if (params_info.hasOwnProperty(el)) {
			if (params_info[el][0] !== "Input") {
				if (params[el] !== params_info[el][3])
					questions[el] = params_info[el];
			}
		}
	}
	return res.send(questions);
});

app.get('/params', function(req, res) {
	return res.send(params);
});

app.get('/baselinecomplete', function(req, res) {
	return res.send(userdata.baselinecomplete);
});

app.get('/starttraining', function(req, res) {
	var url_parts = url.parse(req.url, true);
	var node_config="#!/bin/bash\n\n";
	// Add the training parameters provided by the user.
	var training_params = url_parts.query;
	console.log(training_params);
	var params_changed = 0;
	for (var param in training_params) {
		if (training_params[param] !== "") { // only override if the value is not empty
			if (params[param] !== training_params[param]) {
				params_changed++;
				console.log(param+": "+params[param]+"; "+training_params[param]);
			}
			params[param]=training_params[param];  // replace by user-supplied values.
		}
	}

	var training_parameters="";
	for (var param in params) {
		node_config += param+"="+params[param]+"\n";
		training_parameters += param+"="+params[param]+";"
	}
	console.log(node_config);
	logger("Started training");
	logger("Params,"+training_parameters);
	// Now write to node_config.sh directory.
	fs.writeFileSync("node_config.sh", node_config);
	// Reset the logs.
	aggregatelogs = "";
	// Restart the training if previously failed
	if (userdata.last_fail === "yes")
		userdata.training_status = "";
	console.log("userdata training_status: "+userdata.training_status);
	// Log the current experiment state.
	userdata.experiment_status = Math.max(parseInt(userdata.experiment_status), 
		parseInt(params.experiment_status));
	console.log(userdata);
	fs.writeFileSync("user.json", JSON.stringify(userdata,null,4));

	// Clean the kaldi-recipe setup

        // Run the reset script (typically master_reset.sh) in the experiment working dir
	cleanscript = child_process.spawn('bash',[reset_script, 
		userdata.training_status], {'cwd':working_dir});
        // Event handler code. On the close event, do stuff
	cleanscript.on('close', function(code) {
		console.log("cleanscript exited with code "+code);
		// Now change directory and run the master cript.
		runscript = child_process.spawn('bash',[master_script,
                        userdata.training_status], {'cwd':working_dir});
		runscript.stdout.on('data', function(data) {
		    //console.log(":"+data.toString());
			aggregatelogs += data.toString()+"<br>";
			io.sockets.emit('LOGS', {data : data.toString()+"<br>"});
		});
		// We run the 'STATUS' messages on the stderr stream
		runscript.stderr.on('data', function(data) {
		    training_progress = statusparser(data.toString());
		    console.log("status "+training_progress+" "+data.toString());
		    if (training_progress !== -1) 
		    {
		    	var total_training_states = training_states.length;
//                        if (params.apply_fmllr === "No")
//                            total_training_states = training_states.indexOf("tri2b_decode")+2;
                        io.sockets.emit('STATUS', {data: data.toString(), progress: training_progress,
						   total: total_training_states});
                        userdata.training_status = training_states[training_progress];
                        fs.writeFileSync("user.json", JSON.stringify(userdata,null,4));
                    }
                    else {
			//console.log("|"+data.toString());
                        aggregatelogs += data.toString()+"<br>";
                        io.sockets.emit('LOGS', {data: data.toString()+"<br>"});
		    }
		});
		runscript.on('close', function(code) {
			console.log("The training has quit with code: "+code);
			if (code !== 0)
				userdata.last_fail="yes";
			else
				userdata.last_fail="no";

			if (code === null) {
				code = 2;    // happens if externally stopped.
				logger("Training stopped by the user");
			}
			if (code === 0) {
				runwerscript();	// only run wers on success.
				userdata.baselinecomplete = "yes";
				userdata.experiment_status = Math.max(parseInt(userdata.experiment_status), 
					parseInt(params.experiment_status)+1);
				logger("Training finished successfully");
				io.sockets.emit('close', {close: code});
			}
			else {
				if (code === 1) {
					logger("Training did not finish successfully");
				}
				if (userdata.baselinecomplete !== "yes")  // never flip once completed
					userdata.baselinecomplete = "no";

			    io.sockets.emit('close', {close: 2});
			}
			// update user data
			userdata.training_status = "";
			fs.writeFileSync("user.json", JSON.stringify(userdata,null,4));
			runscript = undefined;
		});
	}); // on close of cleanscript
	console.log('Executed master_script successfully.');
	res.send("Successfullly started the training.");
}) // close of app.get('/starttraining', function(req, res)

	app.get('/stoptraining', function(req, res) {
	    logger("User is stopping the training");
	    // Reset the training status
	    userdata.training_status = "";
	    fs.writeFileSync("user.json", JSON.stringify(userdata,null,4));
	    console.log('Trying to kill process.pid: '+ process.pid);
	    process.kill(-child_process.pid); // kill the entire tree
	    res.send("Sent SIGKILL");
	});

	app.get('/submitsolution', function(req, res) {
	    var url_parts = url.parse(req.url, true);
	    var submitsolution = url_parts.query;
//	    var knowledgebase = JSON.parse(fs.readFileSync('/media/sf_Data/SToNE/knowledgebase.json'));
	    var knowledgebase = JSON.parse(fs.readFileSync('knowledgebase.json'));
	    var solution = knowledgebase.items[url_parts.query.problemid].solution;
	    solution.push({
		"ranking":""+(solution.length+1),
		"upvotes":"0",
		"available":"no",
		"toolkit":submitsolution.toolkit,
		"description":submitsolution.description,
		"detail":submitsolution.howto
	    });
//	    fs.writeFileSync('/media/sf_Data/SToNE/knowledgebase.json', JSON.stringify(knowledgebase, null, 4));
	    fs.writeFileSync('knowledgebase.json', JSON.stringify(knowledgebase, null, 4));
	    var	usersolution="toolkit="+submitsolution.toolkit+";description="+submitsolution.description
		+";detail="+submitsolution.howto+";";
	    fs.appendFile("log.txt", Date()+",User submitted a solution,"+usersolution+"\n", function(err) {
		if (err) throw err;
	    });
	    res.send(solution);
	})

	app.get("/spellchecker", function(req, res) {
	    errorscript = child_process.spawn('bash',[eesen_home+'/error_script.sh'],
					      {'cwd':eesen_home+"/"});
	    errorscript.stdout.on('data', function(data) {
		console.log(data.toString());
		io.sockets.emit("SPELL_ERROR", {"data":data.toString()});
	    })
	    res.send("success");
	})

	setParams = function(param_id) {
	    // Get params from the results file
	    fs.readFile("results.json", function(err, data) {
		if (err) throw err;
		// fetch the user-related variables
		paramsdata = JSON.parse(data);
		if (paramsdata.hasOwnProperty("results")) {
		    if (paramsdata.results.length > 0)
			params = paramsdata.results[param_id].params;
		}
	    });
	}

	app.put("/trainingselection", function(req, res) {
	    var url_parts = url.parse(req.url, true);
	    var training_params = url_parts.query;
	    console.log("training selection id - "+training_params.id);
	    setParams(training_params.id);
	    userdata.training_id=training_params.id;
	    fs.writeFileSync("user.json", JSON.stringify(userdata,null,4));
	    res.send("success");
	});

	app.get("*", function(req, res, next) {
	    console.log("url: "+req.url);
	    if (req.url.indexOf(".html", this.length - ".html".length) !== -1 || req.url === "/") {
		logger("Visited "+req.url);
	    }
	    next();
	});

	initializeparams = function() {
	    params.dictionary="data/local/dict_phn";
	    params.train="data/train";
	    params.test="data/test";
	    params.dev="data/dev";
	    params.lang_model="data/local/lang";
	    params.lang="data/lang_phn";
	    params.lang_test="data/lang_phn_test";
	    params.beam="17.0";
	    params.nj="1";
	    params.min_lmwt="5";
	    params.max_lmwt="10";
	    // check user vars
	    fs.readFile("user.json", function(err, data) {
		if (err) throw err;
		// fetch the user-related variables
		userdata = JSON.parse(data);
		setParams(parseInt(userdata.training_id));
	    });
	}();


runwerscript = function() {
	console.log("calling werscript.");
	var wers={};
	var wermodels=["train_phn_l5_c320"];
	werindex=0;
	var werscript = child_process.spawn('bash',[score_script],
		{'cwd':working_dir});
	werscript.stdout.on('data', function(data) {
		var wer_trim = data.toString().replace(/^\s\s*/, '').replace(/\s\s*$/, '');
		if (wer_trim === "-nan") wer_trim = "-";
		wers[wermodels[werindex++]] = wer_trim;
		console.log("wers: "+wers);
	});
	werscript.on('close', function(code) {
		console.log(wers);
		// Parse the JSON file and push data.
		var data = JSON.parse(fs.readFileSync("results.json"));
		data.results.unshift({
			"wer": wers,
			"derived": {"OOV_train":oovresults.oov_train.percent,
					"OOV_test":oovresults.oov_test.percent},
			"params":params,
			"problems":params_info
		});
		var txt = JSON.stringify(data, null, 4);
		fs.writeFileSync('results.json',txt);
	});
};

statusparser = function(line) {
	status_message = line.split(",");
	return training_states.indexOf(status_message[0]+"_"+status_message[1])
};

wordspotter = function(line) {
	tokens = ['run.pl', 'failed', 'align'];
	spotter = true;
	for (val in tokens) {
		if (line.indexOf(tokens[val]) === -1) spotter = false;
	}
	return spotter;
}

function logger(data) {
	fs.appendFile("log.txt", Date.now()+","+data+"\n", function(err) {
		if (err) throw err;
	});
}

process.on("SIGTERM", function()  {
	console.log("Received SIGTERM :)!");
})
app.listen(portconf.server);
