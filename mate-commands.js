let fs        = require('fs');
let jexpr     = require('./lib/jexpr/jexpr.js');
let nodemailer = require('nodemailer');
let transporter = nodemailer.createTransport();
let mkdirp = require('mkdirp');

let json3 = fs.readFileSync('lib/json3/json3.min.js', {encoding: 'utf8'});

class Commands {

	constructor() {

		this.commands = {};

		this.mate = null;
		this.webdriver = null;
		this.driver = null;

	}

	Attach(mate) {

		this.mate = mate;
		this.webdriver = mate.webdriver;
		this.driver = mate.driver;

	}

	List() {

		let list = Object.keys(this.commands);
		return list.join(', ');

	}

	Register(name, action) {

		//console.log(`Registering command: ${name}`);
		this.commands[name] = (...args) => { action(...args); };

	}

	Run(command, ...args) {

		//console.log('Running command: ' + command + ' with args: ', ...args);
		
		if (!this.commands[command] || !this.commands.hasOwnProperty(command)) {
			console.log(`The command: ${command}, does not exist.`);
			console.log(`The available commands are: ${this.List()}.`);
			return false;
		}

		this.commands[command](...args);

	}

	LoadFromFile(fileName) {

		let content = fs.readFileSync(fileName, { encoding: 'utf-8' });
		let data = JSON.parse(content);
		return data;

	}

	/**
	 * Get data from a previous step, or from a file
	 * @param {Array}  data - The array of steps currently being evaluated
	 * @param {Number} step - The step number we are currently on
	 */
	GetData(data = [], step = 1) {

		let currentStep = data[step] || {};
		let currentStepData = currentStep.data || {};
		let fromStep = currentStepData.fromStep || step - 1;
		let fromFile = currentStepData.fromFile || null;
		let usingExpression = currentStepData.usingExpression || null;
		let res = [];

		res = fromFile ? this.LoadFromFile(fromFile) : data[fromStep].result.data;
		if (usingExpression) { res = jexpr(res, usingExpression); }

		return res;

	}

}

let commands = new Commands();

commands.Register('acceptAlert', (data, step, callback) => {

	commands.driver.switchTo().alert().then( function success(alert) {
		alert.getText().then( function success(text) {
			alert.accept();
			callback({success: true, data: text});
		}).then(null, (err) => {
			callback({success: false, message: err});
		});
	}).then(null, (err) => {
		callback({success: false, message: err});
	});

});

commands.Register('assert', (data, step, callback) => {

	let resultData = commands.GetData(data, step);

	let operator     = data[step].data.operator || 'equal';
	let expected     = data[step].data.expected || null;

	let operators = {
		'equal': (data, expected) => {
			return data == expected;
		},
		'gt': (data, expected) => {
			return data > expected;
		},
		'gte': (data, expected) => {
			return data >= expected;
		},
		'lt': (data, expected) => {
			return data < expected;
		},
		'lte': (data, expected) => {
			return data <= expected;
		},
		'null': (data) => {
			return data === null;
		},
		'notnull': (data, expected) => {
			return data !== null;
		},
		'contains': (data, expected) => {
			return data.indexOf(expected) != -1;
		},
		'notcontains': (data, expected) => {
			return data.indexOf(expected) == -1;
		},
		'inrange': (data, expected) => {
			let range = expected.split('-');
			let lower = parseInt(range[0]);
			let upper = parseInt(range[1]);
			return (data >= lower && data <= upper);
		}
	};

	let res = operators(operator, expected);

	callback({data: res});

});

commands.Register('click', (data, step, callback) => {

	let selector = data[step].data;

	commands.driver.findElement(commands.webdriver.By.css(selector)).then( (el) => {
		el.click();
		callback({success: true});
	}).then( null, (err) => {
		callback({success: false, message: err});
	});

});

commands.Register('commands', (data, step, callback) => {

	let innerCommands = data[step].data;

	let runInnerCommand = (innerStep = 0) => {

		if (innerStep >= innerCommands.length) {

			callback();
			return true;

		}

		let innerCommand = innerCommands[innerStep];

		commands.Run(innerCommands[innerStep].command, innerCommands, innerStep, (innerRes) => {

			runInnerCommand(innerStep + 1);

		});

	};

	runInnerCommand();

});

commands.Register('done', (data, step, callback) => {

	// _id is the campaign ID passed from processCommand

	let fileName = data[step].data || data[step]._id || '';
	if(fileName != '') {
		fileName = 'output/' + fileName.replace(/[\/\\\<\>\|\":?*]/g, '-');
		if(!/\.json$/.test(fileName)) { fileName += '.json'; }
		mkdirp('output/', (err) => {
			if (err) {
				callback({ success: false, message: err });
				return false;
			}
			fs.writeFile(fileName, JSON.stringify(data, null, '\t'), { encoding: 'utf-8' }, (err) => {
				if (err) {
					callback({ success: false, message: err });
					return false;
				}
				callback({fileName: fileName, success: true});
			});
		});
	}
	else {
		callback({ success: true });
	}

});

commands.Register('email', (data, step, callback) => {

	let resultData = commands.GetData(data, step);
	let pad = data[step].data.pad || '    ';
	let nl2br = data[step].data.nl2br || true;

	let dataStr = pad ? JSON.stringify(resultData, null, pad) : JSON.stringify(resultData);
	dataStr = nl2br ? dataStr.replace(/[\n\r]/g, '<br />') : dataStr;

	let mailOptions = {
		from: 'mate <azcn2503@gmail.com>',
		to: data[step].data.to || 'azcn2503@gmail.com',
		subject: data[step].data.subject || 'mate results',
		text: dataStr,
		html: `<h1>mate results</h1><p>Results from your mate campaign: ${commands.mate.campaign.id}</p><p style="font-family: monospace; padding: 5px; background-color: #ddd;">${dataStr}</p>`
	};

	transporter.sendMail(mailOptions, function(error, info) {
		if(error) {
			callback({success: false});
		}
		else {
			callback({success: true});
		}
	});

});

commands.Register('eval', (data, step, callback) => {

	let fromStep     = data[step].data.fromStep ;
	let usingExpression = data[step].data.usingExpression || null;
	let evalScript   = data[step].data.eval;
	let resultData = data[fromStep].result.data;

	if(usingExpression) {
		resultData = jexpr(resultData, usingExpression);
	}

	evalScript = '(function() {' + evalScript + '}.bind(d))()';

	let d = resultData;
	let res = eval(evalScript);

	callback({data: res, success: true});

});

commands.Register('extractTable', (data, step, callback) => {

	let selector = data[step].data.selector || 'table';
	let options = data[step].data.options || {colCountMode: 'auto', headings: 'auto', output: 'json'};

	let evalExtractTable = function(selector, options) {

		selector = selector || 'table';
		options = options || {};
		options.colCountMode = options.colCountMode || 'auto'; // auto, th
		options.headings = options.headings || 'auto'; // auto, [heading1, heading2, ...]
		options.output = options.output || 'json'; // json, csv

		let table = document.querySelector(selector);

		let headings = options.headings == 'auto' ? [] : options.headings;
		let content = [];
		let cells = 0;
		let rows = 0;
		let cols = 0;

		let tr = table.querySelectorAll('tr');
		for (let i in tr) {
			if (!tr[i] || !tr.hasOwnProperty(i)) {
				continue;
			}
			if(!tr[i].querySelectorAll) { continue; }
			rows++;
			if (headings.length == 0 && options.headings == 'auto') {
				let th = tr[i].querySelectorAll('th');
				for (let j in th) {
					if (!th[j] || !th.hasOwnProperty(j) || !th[j].innerText) {
						continue;
					}
					cells++;
					headings.push(th[j].innerText);
				}
			}
			let td = tr[i].querySelectorAll('td');
			for (let j in td) {
				if (!td[j] || !td.hasOwnProperty(j) || !td[j].innerText) {
					continue;
				}
				cells++;
				content.push(td[j].innerText);
			}
		}

		if (options.colCountMode == 'auto') {
			cols = Math.round(cells / rows);
		}
		if (options.colCountMode == 'th') {
			cols = headings.length;
		}

		if (options.output == 'json') {
			let res = [];
			for (let i = 0; i < content.length; i += cols) {
				let tmpData = content.slice(i, i + cols);
				for (let j in tmpData) {
					res.push({
						th: headings[j],
						td: tmpData[j]
					});
				}
			}
			return res;
		}

		if (options.output == 'csv') {
			let csv = '';
			csv += headings.join(',');
			for (let i = 0; i < content.length; i += cols) {
				let tmpData = content.slice(i, i + cols)
				csv += '\n' + tmpData.join(',');
			}
			return csv;
		}

	};

	commands.driver.executeScript(evalExtractTable, selector, options).then(function success(data) {
		callback({success: true, data: data});
	}).then(null, function error(res) {
		console.log(res);
		callback({success: false});
	});

});

commands.Register('getAttributeValues', function (data, step, callback) {

	let generateKey = (key, unique) => {

		if (this.uniqueKey) {
			key = `_${this.keyIndex}_${key}`;
			this.keyIndex++;
		}
		return key;

	};

	let addKey = (res, key) => {

		res[key] = res[key] ? res[key] : '';
		return res;

	};

	let addValue = (res, key, val) => {

		if (!val || val == '') { return res; }
		if (!res[key]) { res = addKey(res, key); }
		res[key] += val;
		return res;

	};

	let groupResByKeyNameSatisfied = (res, keys) => {

		let tmpName = 0;
		let tmpMatch = 0;
		for (let i in keys) {
			if (!keys[i].name) { continue; }
			tmpName++;
			if (!groupRes[keys[i].name]) { continue; }
			tmpMatch++;
		}
		if (tmpName == tmpMatch) { return true; }
		return false;

	};

	let resultData = commands.GetData(data, step);

	let attributeName           = typeof(data[step].data === 'string') ? data[step].data : data[step].data.attributeName; // required
	let matchingExpression      = data[step].data.matchingExpression || null;
	let matchingExpressionFlags = data[step].data.matchingExpressionFlags || '';
	let kvp                     = data[step].data.kvp || null;
	let group                   = data[step].data.group || false;

	// key value pair settings
	if(kvp) {
		kvp.k = kvp.k || [];
		kvp.v = kvp.v || [];
		kvp.groupByKeyName = kvp.groupByKeyName || false;
		this.keyIndex = 0;
		this.uniqueKey = false;
	}

	// Support multiple attributes
	if(typeof(attributeName) === 'string') { attributeName = [attributeName]; }
	if(typeof(matchingExpression) === 'string') { matchingExpression = [matchingExpression]; }
	if(typeof(matchingExpressionFlags) === 'string') { matchingExpressionFlags = [matchingExpressionFlags]; }

	let res = [];

	let kvpK = kvpKNext = kvpV = kvpVNext = tmp = null;

	for(let i in resultData) { // loop through each element

		let el = resultData[i];
		let groupRes = null;

		if(kvp && kvp.groupByKeyName && kvp.k.length > 0 && groupRes && Object.keys(groupRes).length > 0) {
			if(groupResByKeyNameSatisfied(groupRes, kvp.k)) {
				groupRes = {};
			}
		}
		else {
			groupRes = {};
		}

		for(let j in attributeName) { // loop through desired attribute names

			let attr = attributeName[j];

			if(!el[attr]) { continue; }

			// if a matching expression is provided
			if(matchingExpression && matchingExpression[j]) {
				let re = new RegExp(matchingExpression[j], matchingExpressionFlags[j]);
				if(!re.test(el[attr])) { continue; }
			}

			// key value pair stuff
			if(kvp) {

				kvp.k = kvp.k || [];
				kvp.v = kvp.v || [];
				if(typeof(kvp.k) === 'string') { kvp.k = [kvp.k]; }
				if(typeof(kvp.v) === 'string') { kvp.v = [kvp.v]; }

				if(kvpKNext) {
					kvpK = typeof(kvpKNext) === 'string' ? generateKey(kvpKNext) : generateKey(el[attr]);
					kvpKNext = false;
					groupRes = addKey(groupRes, kvpK); 
				}
				
				if(kvpVNext) {
					kvpV = el[attr];
					kvpVNext = false;
					groupRes = addValue(groupRes, kvpK, kvpV);
				}

				for(let k in kvp.k) {

					kvp.k[k].attributeName = kvp.k[k].attributeName || null;
					kvp.k[k].matchingExpression = kvp.k[k].matchingExpression || null;
					kvp.k[k].matchingExpressionFlags = kvp.k[k].matchingExpressionFlags || '';
					kvp.k[k].name = kvp.k[k].name || null;
					kvp.k[k].mode = kvp.k[k].mode || null;

					if(attr == kvp.k[k].attributeName) {
						let re = new RegExp(kvp.k[k].matchingExpression, kvp.k[k].matchingExpressionFlags);
						if(re.test(el[attr])) {
							if(kvp.k[k].mode == 'after') {
								kvpKNext = kvp.k[k].name ? kvp.k[k].name : true;
								kvpVNext = false;
								break;
							}
							kvpK = kvp.k[k].name || generateKey(el[attr]);
							groupRes = addKey(groupRes, kvpK);
							break;
						}
					}

				}

				for(let k in kvp.v) {

					kvp.v[k].attributeName = kvp.v[k].attributeName || null;
					kvp.v[k].matchingExpression = kvp.v[k].matchingExpression || null;
					kvp.v[k].matchingExpressionFlags = kvp.v[k].matchingExpressionFlags || '';
					kvp.v[k].name = kvp.v[k].name || null;
					kvp.v[k].mode = kvp.v[k].mode || null;

					if(attr == kvp.v[k].attributeName) {
						let re = new RegExp(kvp.v[k].matchingExpression, kvp.v[k].matchingExpressionFlags);
						if(re.test(el[attr])) {
							if(kvp.v[k].mode == 'after') {
								kvpKNext = false;
								kvpVNext = true;
								break;
							}
							kvpV = el[attr];
							groupRes = addValue(groupRes, kvpK, kvpV);
							break;
						}
					}

				}

			}

			// no key value pair - flat response
			if(!kvp) {
				if(group) {
					groupRes[attr] = el[attr];
				}
				else { res.push(el[attr]); }
			}

		}

		// add the grouped response to the result if grouping or kvp is enabled
		if(Object.keys(groupRes).length > 0) {
			if(group) {
				res.push(groupRes);
			}
			if(kvp) {
				if(kvp.groupByKeyName) {
					if(groupResByKeyNameSatisfied(groupRes, kvp.k)) {
						res.push(groupRes);
					}
				}
				else {
					if(groupRes[Object.keys(groupRes)[0]] != '') {
						res.push(groupRes);
					}
				}
			}
		}

	}

	callback({success: true, data: res});

});

commands.Register('getCurrentURL', (data, step, callback) => {

	commands.driver.getCurrentUrl().then(function success(url) {
		callback({success: true, data: url});
	});

});

commands.Register('getWindowHandle', (data, step, callback) => {

	commands.driver.getWindowHandle().then(function success(handle) {
		callback({success: true, data: handle});
	}).then(null, function error() {
		callback({success: false});
	});

});

commands.Register('getWindowHandles', (data, step, callback) => {

	commands.driver.getAllWindowHandles().then(function success(handles) {
		callback({success: true, data: handles});
	}).then(null, function error() {
		callback({success: false});
	});

});

commands.Register('matchEach', (data, step, callback) => {

	let resultData = commands.GetData(data, step);

	let matchingExpression      = data[step].data.matchingExpression; // required
	let matchingExpressionFlags = data[step].data.matchingExpressionFlags || '';
	let mode                    = data[step].data.mode || 'match';

	let res = [];

	let re = new RegExp(matchingExpression, matchingExpressionFlags);

	for(let i in resultData) {
		let subject = resultData[i];
		if(!re.test(subject)) { continue; }
		if(mode == 'full') {
			res.push(resultData[i]);
		}
		if(mode == 'array') {
			res.push(subject.match(re));
		}
		if(mode == 'match') {
			res.push(subject.match(re)[0]);
		}
	}

	callback({success: true, data: res});

});

commands.Register('open', (data, step, callback) => {

	let url = data[step].data;
	if (!commands.driver) {
		commands.mate.BuildDriver('chrome');
		commands.Attach(commands.mate);
	}
	commands.driver.get(url).then( () => {
		callback({success: true});
	}).then(null, (err) => {
		callback({success: false, message: err});
	});

});

commands.Register('repeat', (data, step, callback) => {

	data[step].data = data[step].data || {};
	let repeatSteps = data[step].data.steps || step - 1; // default previous step
	if(typeof(repeatSteps) !== 'object') { repeatSteps = [repeatSteps]; }
	let repeatTimes = data[step].data.times || 1;

	let res = [];

	let repeat = (i = 0, j = 0) => {
		let repeatStep = repeatSteps[j];
		let repeatCommand = data[repeatStep].command;
		let originalStep = data[repeatStep];
		commands.Run(repeatCommand, data, repeatStep, (data) => {
			if(!data.success) { callback({ success: true, data: res}); return; }
			originalStep.result = data;
			res.push(data);
			if(j == repeatSteps.length - 1) {
				if(i == repeatTimes - 1) {
					callback({success: true, data: res});
				}
				else {
					repeat(i + 1);
				}
			}
			else {
				repeat(i, j + 1);
			}
		});
	};

	repeat();

});

commands.Register('runCampaign', (data, step, callback) => {

	if (!data[step].data) { callback({ success: false, message: 'Need to provide data for this command' }); return false; }

	let resultData = commands.GetData(data, step);

	let campaign = typeof(data[step].data) === 'string' ? data[step].data : data[step].data.campaign || null;
	let withArgs = data[step].data.withArgs || {};
	let usingData = data[step].data.usingData || {};
	usingData.fromFile = usingData.fromFile || null;
	usingData.fromStep = usingData.fromStep || step - 1;
	usingData.asArgument = usingData.asArgument || 'initial';

	let withArgsArr = [];
	for (let i in Object.keys(withArgs)) {
		let key = Object.keys(withArgs)[i];
		withArgsArr.push(`--${key}=${withArgs[key]}`);
	}

	let spawn = require('child_process').spawn;

	let iterateResultData = (n = 0) => {

		if (!resultData[n]) { callback({ success: true, iterations: n }); return true; }

		let args = ['main.js', campaign, `--${usingData.asArgument}=${resultData[n]}`, `--generation=${commands.mate.args['generation'] + 1}`, `--iteration=${n}`, ...withArgsArr]
		console.log('Spawning node process with the following arguments: ', args);
		let mateChild = spawn('node', args);

		let logData = (data) => {
			data = data.toString().trim().replace(/[\n\r]/g, '\n    ');
			console.log(`    ${data}`);
		};

		mateChild.stdout.on('data', logData);
		mateChild.stderr.on('data', logData);

		mateChild.on('close', (code) => {
			iterateResultData(n + 1);
		});

	};

	iterateResultData();

});

commands.Register('runScript', (data, step, callback) => {

	let script = data[step].data;

	let evalScript = function(script) {
		eval(script);
		return true;
	};

	commands.driver.executeScript(evalScript, script).then(function success() {
		callback({success: true});
	}).then(null, function error(err) {
		callback({success: false, message: err});
	});

});

commands.Register('save', (data, step, callback) => {

	let resultData = commands.GetData(data, step);

	let fileName     = typeof(data[step].data) === 'string' ? data[step].data : data[step].data.fileName || new Date().getTime() + Math.random().toString().replace(/\./, '0');
	let fileType     = data[step].data.fileType || 'json';

	fileName = fileName.replace(/[\/\\\<\>\|\":?*]/g, '-');

	fileName = 'commands/save/' + fileName + '.' + fileType;

	let saveData = '';
	if(fileType == 'json') { saveData = JSON.stringify(resultData, null, '\t'); }
	else { saveData = resultData; }

	mkdirp('commands/save', function(err) {
		if(err) { 
			callback({
				message: err,
				success: false
			});
			return;
		}
		fs.writeFileSync(fileName, saveData, {'encoding': 'utf-8'});
		callback({
			data: {
				'fileName': fileName
			},
			success: true
		});
	});

});

commands.Register('screenshot', (data, step, callback) => {

	let fileName = data[step].data || null;

	fileName = fileName || new Date().getTime() + Math.random().toString().replace(/\./, '0') + '.png';
	fileName = 'commands/screenshot/' + fileName;

	mkdirp('commands/screenshot', function(err) {
		if(err) {
			callback({success: false, message: err});
			return;
		}
		commands.driver.takeScreenshot().then( function success(data) {
			fs.writeFileSync(fileName, data, {'encoding': 'base64'});
			callback({
				data: {
					'filename': fileName
				},
				success: true
			});
		});
	});

});

commands.Register('scrollPageTo', (data, step, callback) => {

	data = data[step].data || {};
	let to            = data.to || 'end';
	let timeout       = data.timeout || 60;
	let scrolls       = 0;
	let maxScrolls    = data.maxScrolls || null;
	let maxRetries    = data.maxRetries || 5;
	let startTime     = Math.floor(Date.now() / 1000);
	let prevScrollTop = 0;
	let tries         = 0;
	let scrollTop     = 0;

	let evalScroll = (to) => {
		switch(to) {
			case 'home':
				window.scrollTo(0, 0);
				break;
			case 'end':
				window.scrollTo(0, document.body.scrollHeight);
				break;
			default:
				window.scrollTo(0, to);
				break;
		}
		return document.body.scrollTop;
	};

	let scroll = () => {

		commands.driver.executeScript(evalScroll, to).then( (scrollTop) => {
			processScroll(scrollTop);
		}).then(null, (err) => {
			callback({ success: false, message: err });
		});

	};

	let processScroll = (scrollTop) => {

		let processScrollTime = Math.floor(Date.now() / 1000);
		scrolls++;

		let scrollDiff = scrollTop - prevScrollTop;
		let scrollDiffMessage = scrollDiff > 0 ? ` (+${scrollDiff})` : '';

		console.log(`Scrolled to ${scrollTop}${scrollDiffMessage}`);

		if(scrollTop == prevScrollTop) {
			tries++;
		}
		else {
			tries = 0;
		}

		prevScrollTop = scrollTop;

		if(	(maxScrolls && scrolls >= maxScrolls)
		|| (maxRetries && tries >= maxRetries)
		|| (processScrollTime - startTime >= timeout) ) {
			callback({
				success: true,
				data: { scrollTop: scrollTop }
			});
			return true;
		}

		// scroll again if no limits exceeded
		setTimeout( () => {
			scroll();
		}, 1000);

	};

	scroll();

});

commands.Register('scrollPageToEnd', (data, step, callback) => {

	data[step].data = data[step].data || {};
	data[step].data.to = 'end';

	commands.Run('scrollPageTo', data, step, callback);

});

commands.Register('scrollPageToHome', (data, step, callback) => {

	data[step].data = data[step].data || {};
	data[step].data.to = 'home';

	commands.Run('scrollPageTo', data, step, callback);

});

commands.Register('search', (data, step, callback) => {

	let searchText = data[step].data || 'mate';
	data[step].data = {};
	data[step].data.selector = 'input[name=q]';
	data[step].data.string = searchText + commands.webdriver.Key.RETURN;

	commands.Run('sendKeys', data, step, callback);

});

commands.Register('select', (data, step, callback) => {

	let selector = data[step].data || 'body';
	let details = true;
	if(typeof(selector) === 'object') {
		selector = selector.selector || 'body';
		details = selector.details || true;
	}

	let evalSelect = function(selector, json3) {

		if(!document.querySelector('script#mateJSON3')) {

			let script = document.createElement('script');
			script.id = 'mateJSON3';
			script.innerText = json3;

			document.querySelector('head').appendChild(script);

		}

		let els = getElementEssentials(selector);
		return els;

		function getElementEssentials(selector) {

			let thisEl = document.querySelector(selector);

			let tmpEl = {};

			for(let i in thisEl) {

				let thisProp = thisEl[i];

				if(/array|object|function/.test(typeof(thisProp))) { continue; }

				tmpEl[i] = thisProp;

			}

			return JSON.stringify([tmpEl]);

		}

	};

	commands.driver.findElement(commands.webdriver.By.css(selector)).then( function success(el) {

		if(details) {

			commands.driver.executeScript(evalSelect, selector, json3).then( function success(nativeEl) {
				callback({
					data: JSON.parse(nativeEl),
					success: true
				});
			}).then(null, function error(error) {
				callback({success: false, message: error});
			});

		}

		else {

			callback({success: true});

		}

	}).then(null, function error(error) {
		callback({success: false, message: error});
	});

});

commands.Register('selectAll', (data, step, callback) => {

	let selector = data[step].data || 'body';
	let details = true;
	if(typeof(selector) === 'object') {
		selector = selector.selector || 'body';
		details = selector.details || true;
	}

	let evalSelectAll = function(selector, json3) {

		if(!document.querySelector('script#mateJSON3')) {

			let script = document.createElement('script');
			script.id = 'mateJSON3';
			//script.src = '//cdnjs.cloudflare.com/ajax/libs/json3/3.3.2/json3.js';
			script.innerText = json3;

			document.querySelector('head').appendChild(script);

		}

		let els = getElementEssentials(selector);
		return els;

		function getElementEssentials(selector) {

			let els = document.querySelectorAll(selector);

			let els2 = [];

			for(let i in els) {

				if(!els.hasOwnProperty(i)) { continue; }

				let thisEl = els[i];
				let tmpEl = {};

				for(let j in thisEl) {

					let thisProp = thisEl[j];

					if(/array|object|function/.test(typeof(thisProp))) { continue; }

					tmpEl[j] = thisProp;

				}

				els2.push(tmpEl);

			}

			return JSON3.stringify(els2);

		}

	};

	commands.driver.findElements(commands.webdriver.By.css(selector)).then( function success(els) {

		if(details) {

			commands.driver.executeScript(evalSelectAll, selector, json3).then( function success(nativeEls) {
				callback({
					data: JSON.parse(nativeEls),
					success: true
				});
			}).then(null, function error(error) {
				callback({success: false, message: error})
			});

		}

		else{

			callback({success: true});

		}

	}).then(null, function error(error) {
		callback({success: false, message: error});
	});

});

commands.Register('sendKeys', (data, step, callback) => {

	data = data[step].data;

	let selector = data.selector;
	let string = data.string;

	commands.driver.findElement(commands.webdriver.By.css(selector)).sendKeys(string).then( function success() {
		callback({success: true});
	}).then(null, function error(message) {
		callback({success: false, error: message});
	});

});

commands.Register('setImplicitWaitTimeout', (data, step, callback) => {

	let ms = data[step].data || 1000;
	commands.driver.manage().timeouts().implicitlyWait(ms);
	callback({success: true});

});

commands.Register('setWindow', (data, step, callback) => {

	let handle = data[step].data;

	commands.driver.switchTo().window(handle).then(function success() {
		callback({success: true});
	}).then(null, function error() {
		callback({success: false});
	});

});

commands.Register('submitForm', (data, step, callback) => {

	let selector = data[step].data || 'form';

	let evalSubmit = function(selector) {
		document.querySelector(selector).submit();
		return true;
	};

	commands.driver.executeScript(evalSubmit, selector).then( () => {
		callback({success: true});
	}).then(null, (err) => {
		callback({success: false, message: err});
	});

});

commands.Register('useBrowser', (data, step, callback) => {

	let browserName = typeof(data[step].data) === 'string' ? data[step].data : data[step].data.browserName || 'chrome';
	let implicitWait = data[step].data.implicitWait || 10000;
	commands.mate.BuildDriver(browserName, implicitWait);
	commands.Attach(commands.mate);
	callback({ success: true });

});

commands.Register('wait', (data, step, callback) => {

	let ms = data[step].data || 1000;
	if (isNaN(ms)) { callback({ success: false, message: 'You must specify a number of milliseconds to wait'}); return false; }

	setTimeout( () => {
		callback({ success: true });
	}, ms);

});

commands.Register('waitForPageToLoad', (data, step, callback) => {

	let evalWaitForPageToLoad = () => {

		let isLoaded = () => {

			if (document.readyState == 'complete') { return true; }
			setTimeout( () => { isLoaded(); }, 1000);

		};

		return isLoaded();

	};

	commands.driver.executeScript(evalWaitForPageToLoad).then( () => {
		callback({success: true});
	}).then(null, (err) => {
		callback({success: false, message: err});
	});

});

exports.commands = commands;