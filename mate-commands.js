let events    = require('events');
let fs        = require('fs');
let jexpr     = require('./lib/jexpr/jexpr.js');
let vm        = require('vm');
let nodemailer = require('nodemailer');
let transporter = nodemailer.createTransport();
let mkdirp = require('mkdirp');

let json3 = fs.readFileSync('lib/json3/json3.min.js', {encoding: 'utf8'});

class Commands {

	constructor() {

		this.commands = {};

		this.webdriver = null;
		this.driver = null;

	}

	SetDrivers(webdriver, driver) {

		this.webdriver = webdriver;
		this.driver = driver;

		this.driver.manage().timeouts().implicitlyWait(1000);

	}

	Register(name, action) {

		//console.log(`Registering command: ${name}`);
		this.commands[name] = (...args) => { action(...args); };

	}

	Run(command, ...args) {

		//console.log('Running command: ' + command + ' with args: ', ...args);
		this.commands[command](...args);

	}

}

let commands = new Commands();

commands.Register('acceptAlert', (data, step, callback) => {
	commands.driver.switchTo().alert().then( function success(alert) {
		alert.getText().then( function success(text) {
			alert.accept();
			callback({success: true, data: text});
		}).then(null, function error() {
			callback({success: false});
		});
	}).then(null, function error() {
		callback({success: false});
	});
});

commands.Register('assert', (data, step, callback) => {
	let fromStep     = data[step].data.fromStep || step - 1;
	let usingExpression = data[step].data.usingExpression || null;
	let recurse      = false;
	let operator     = data[step].data.operator || 'equal';
	let expected     = data[step].data.expected || null;
	let resultData = data[fromStep].result.data || null;

	if(usingExpression) {
		resultData = jexpr(resultData, usingExpression);
	}

	this.assertItem = function(data, operator, expected) {

		let res = {
			assert: false,
			reason: {
				message  : '',
				expected : '',
				actual   : '',
				index    : null
			},
			success: true
		};

		switch(operator) {

			case 'equal':
				if(data == expected) { res.assert = true; }
			break;

			case 'gt':
				if(data > expected) { res.assert = true; }
			break;

			case 'gte':
				if(data >= expected) { res.assert = true; }
			break;

			case 'lt':
				if(data < expected) { res.assert = true; }
			break;

			case 'lte':
				if(data <= expected) { res.assert = true; }
			break;

			case 'null':
				if(data === null) { res.assert = true; }
			break;

			case 'notnull':
				if(data !== null) { res.assert = true; }
			break;

			case 'contains':
				if(data.indexOf(expected) != -1) { res.assert = true; }
			break;

			case 'notcontains':
				if(data.indexOf(expected) == -1) { res.assert = true; }
			break;

			case 'inrange':
				let range = expected.split('-');
				let lower = parseInt(range[0]);
				let upper = parseInt(range[1]);
				if(data >= lower && data <= upper) { res.assert = true; }
			break;

		}

		res.reason.expected = aliases[operator] + ' ' + expected;
		res.reason.actual   = data;
		res.reason.message  = res.assert ? 'pass' : 'fail';

		return res;

	};

	let aliases = {
		'equal'       : '=',
		'gt'          : '>',
		'gte'         : '>=',
		'lt'          : '<',
		'lte'         : '<=',
		'null'        : 'null',
		'notnull'     : 'not null',
		'contains'    : 'contains',
		'notcontains' : 'does not contain',
		'inrange'     : 'is between'
	};

	let tmpData = null;

	if(typeof(resultData) === 'object' || typeof(resultData) === 'array') {

		for(let i in resultData) {

			res = this.assertItem(resultData[i], operator, expected);

			if(res.assert) { break; }

		}

	}

	else {

		console.log('just one');

		res = this.assertItem(resultData, operator, expected);

	}

	callback({data: res});
});

commands.Register('click', (data, step, callback) => {
	let selector = data[step].data;

	commands.driver.findElement(commands.webdriver.By.css(selector)).then( function success(el) {
		el.click();
		callback({success: true});
	}).then( null, function error(error) {
		callback({success: false});
	});
});

commands.Register('commands', (data, step, callback) => {

	let innerCommands = data[step].data;

	console.log('innerCommands', innerCommands);

	let runInnerCommand = (innerStep = 0) => {

		if (innerStep >= innerCommands.length) {

			callback();
			return true;

		}

		let innerCommand = innerCommands[innerStep];
		console.log('innerCommand', innerCommand);

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
	}

	commands.driver.quit();

	callback({fileName: fileName, success: true});
});

commands.Register('email', (data, step, callback) => {
	let fromStep = data[step].data.fromStep;
	let usingExpression = data[step].data.usingExpression || null;
	let resultData = data[fromStep].result.data;

	if(usingExpression) {
		resultData = jexpr(resultData, usingExpression);
	}

	let mailOptions = {
		from: 'mate <azcn2503@gmail.com>',
		to: data[step].data.to || 'azcn2503@gmail.com',
		subject: data[step].data.subject || 'mate results',
		text: JSON.stringify(resultData),
		html: '<h1>mate results</h1><p style="font-family: monospace; padding: 5px; background-color: #ddd;">' + JSON.stringify(resultData) + '</p>'
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

	var self = this;

	this.generateKey = function(key, unique) {

		if(self.uniqueKey) {
			key = '_' + self.keyIndex + '_' + key;
			self.keyIndex++;
		}
		
		return key;

	};

	this.addKey = function(res, key) {

		res[key] = res[key] ? res[key] : '';

		return res;

	};

	this.addValue = function(res, key, val) {

		if(!val || val == '') { return res; }

		if(!res[key]) { res = self.addKey(res, key); }

		res[key] += val;

		return res;

	};

	this.groupResByKeyNameSatisfied = function(res, keys) {

		var tmpName = 0;
		var tmpMatch = 0;
		for(var i in keys) {
			if(keys[i].name) {
				tmpName++;
				if(groupRes[keys[i].name]) {
					tmpMatch++;
				}
			}
		}
		if(tmpName == tmpMatch) {
			return true;
		}
		return false;

	};

	var fromStep                = data[step].data.fromStep || step - 1; // required
	var attributeName           = data[step].data.attributeName; // required
	var matchingExpression      = data[step].data.matchingExpression || null;
	var matchingExpressionFlags = data[step].data.matchingExpressionFlags || '';
	var kvp                     = data[step].data.kvp || null;
	var group                   = data[step].data.group || false;
	var usingExpression = data[step].data.usingExpression || null;
	var resultData            = data[fromStep].result.data;

	if(usingExpression) { resultData = jexpr(resultData, usingExpression); console.log('resultData', resultData); }

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

	var res = [];

	var kvpK = kvpKNext = kvpV = kvpVNext = tmp = null;

	for(var i in resultData) { // loop through each element

		var el = resultData[i];

		if(kvp && kvp.groupByKeyName && kvp.k.length > 0 && groupRes && Object.keys(groupRes).length > 0) {
			if(self.groupResByKeyNameSatisfied(groupRes, kvp.k)) {
				groupRes = {};
			}
		}
		else {
			var groupRes = {};
		}

		for(var j in attributeName) { // loop through desired attribute names

			var attr = attributeName[j];

			if(!el[attr]) { continue; }

			// if a matching expression is provided
			if(matchingExpression && matchingExpression[j]) {
				var re = new RegExp(matchingExpression[j], matchingExpressionFlags[j]);
				if(!re.test(el[attr])) { continue; }
			}

			// key value pair stuff
			if(kvp) {

				kvp.k = kvp.k || [];
				kvp.v = kvp.v || [];
				if(typeof(kvp.k) === 'string') { kvp.k = [kvp.k]; }
				if(typeof(kvp.v) === 'string') { kvp.v = [kvp.v]; }

				if(kvpKNext) {
					kvpK = typeof(kvpKNext) === 'string' ? self.generateKey(kvpKNext) : self.generateKey(el[attr]);
					kvpKNext = false;
					groupRes = self.addKey(groupRes, kvpK); 
				}
				
				if(kvpVNext) {
					kvpV = el[attr];
					kvpVNext = false;
					groupRes = self.addValue(groupRes, kvpK, kvpV);
				}

				for(var k in kvp.k) {

					kvp.k[k].attributeName = kvp.k[k].attributeName || null;
					kvp.k[k].matchingExpression = kvp.k[k].matchingExpression || null;
					kvp.k[k].matchingExpressionFlags = kvp.k[k].matchingExpressionFlags || '';
					kvp.k[k].name = kvp.k[k].name || null;
					kvp.k[k].mode = kvp.k[k].mode || null;

					if(attr == kvp.k[k].attributeName) {
						var re = new RegExp(kvp.k[k].matchingExpression, kvp.k[k].matchingExpressionFlags);
						if(re.test(el[attr])) {
							if(kvp.k[k].mode == 'after') {
								kvpKNext = kvp.k[k].name ? kvp.k[k].name : true;
								kvpVNext = false;
								break;
							}
							kvpK = kvp.k[k].name || self.generateKey(el[attr]);
							groupRes = self.addKey(groupRes, kvpK);
							break;
						}
					}

				}

				for(var k in kvp.v) {

					kvp.v[k].attributeName = kvp.v[k].attributeName || null;
					kvp.v[k].matchingExpression = kvp.v[k].matchingExpression || null;
					kvp.v[k].matchingExpressionFlags = kvp.v[k].matchingExpressionFlags || '';
					kvp.v[k].name = kvp.v[k].name || null;
					kvp.v[k].mode = kvp.v[k].mode || null;

					if(attr == kvp.v[k].attributeName) {
						var re = new RegExp(kvp.v[k].matchingExpression, kvp.v[k].matchingExpressionFlags);
						if(re.test(el[attr])) {
							if(kvp.v[k].mode == 'after') {
								kvpKNext = false;
								kvpVNext = true;
								break;
							}
							kvpV = el[attr];
							groupRes = self.addValue(groupRes, kvpK, kvpV);
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
					if(self.groupResByKeyNameSatisfied(groupRes, kvp.k)) {
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

	let fromStep                = data[step].data.fromStep; // required
	let usingExpression         = data[step].data.usingExpression || null;
	let matchingExpression      = data[step].data.matchingExpression; // required
	let matchingExpressionFlags = data[step].data.matchingExpressionFlags || '';
	let mode                    = data[step].data.mode || 'match';
	let resultData            = data[fromStep].result.data;

	if(usingExpression) {
		resultData = jexpr(resultData, usingExpression);
	}

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
	commands.driver.get(url).then(function success() {
		callback({success: true});
	}).then(null, function error() {
		callback({success: false});
	});
});

commands.Register('repeat', (data, step, callback) => {

	data[step].data = data[step].data || {};
	let repeatSteps = data[step].data.steps || step - 1; // default previous step
	if(typeof(repeatSteps) !== 'object') { repeatSteps = [repeatSteps]; }
	let repeatTimes = data[step].data.times || 1;

	let res = [];

	(function repeat(i, j) {
		var self = this;
		this.i = i || 0;
		this.j = j || 0;
		var repeatStep = repeatSteps[this.j];
		var repeatCommand = data[repeatStep].command;
		this.originalStep = data[repeatStep];
		commands[repeatCommand](data, repeatStep, function repeatCallback(data) {
			if(!data.success) { callback({ success: true, data: res}); return; }
			self.originalStep.result = data;
			res.push(data);
			if(self.j == repeatSteps.length - 1) {
				if(self.i == repeatTimes - 1) {
					callback({success: true, data: res});
				}
				else {
					repeat(self.i + 1);
				}
			}
			else {
				repeat(self.i, self.j + 1);
			}
		});
	})();

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
		console.log(err);
		callback({success: false});
	});

});

commands.Register('save', (data, step, callback) => {

	let fromStep     = data[step].data.fromStep;
	let usingExpression = data[step].data.usingExpression || null;
	let fileName     = data[step].data.fileName || new Date().getTime() + Math.random().toString().replace(/\./, '0');
	let fileType     = data[step].data.fileType || 'json';
	let resultData = data[fromStep].result.data;

	if(usingExpression) {
		resultData = jexpr(resultData, usingExpression);
	}

	fileName = fileName.replace(/[\/\\\<\>\|\":?*]/g, '-');

	fileName = 'commands/save/' + fileName + '.' + fileType;

	let saveData = '';
	if(fileType == 'json') { saveData = JSON.stringify(resultData, null, '\t'); }
	else { saveData = resultData; }

	mkdirp('commands/save', function(err) {
		if(err) { 
			callback({
				data: {
					error: err
				},
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
			callback({success: false, error: err});
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

	console.log('scrolling page to a point');

	var self          = this;
	var data          = data[step].data || {};
	var to            = data.to || 'end';
	var timeout       = data.timeout || 60;
	var scrolls       = 0;
	var maxScrolls    = data.maxScrolls || null;
	var maxRetries    = data.maxRetries || 5;
	var startTime     = Math.floor(Date.now() / 1000);
	var prevScrollTop = 0;
	var tries         = 0;
	var scrollTop     = 0;

	this.eventEmitter = new events.EventEmitter();

	var evalScroll = function(to) {
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

	this.eventEmitter.on('scroll', function() {

		commands.driver.executeScript(evalScroll, to).then( function(scrollTop) {
			self.eventEmitter.emit('processScroll', scrollTop);
		});

	});

	this.eventEmitter.on('processScroll', function(scrollTop) {

		var processScrollTime = Math.floor(Date.now() / 1000);
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
			self.eventEmitter.emit('done', scrollTop);
			return;
		}
		else { // scroll again if no limits exceeded
			setTimeout( function() {
				self.eventEmitter.emit('scroll');
			}, 1000);
		}

	});

	this.eventEmitter.on('done', function(scrollTop) {

		prevScrollTop = scrollTop;
		callback({
			data: {
				'scrollTop': scrollTop
			},
			success: true
		});
		return;

	});

	this.eventEmitter.emit('scroll');
	return;

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

	commands.driver.executeScript(evalSubmit, selector).then(function success() {
		callback({success: true});
	}).then(null, function error() {
		callback({success: false});
	});

});

commands.Register('suggestSelector', (data, step, callback) => {

	let selector = data[step].data;

	let evalSuggest = function(selector, mode, inContext) {

		let self = this;
		
		this.returnNodes = function(nodes) {
			
			if(self.mode == 'native') {
				// Return an array of native elements
				let arr = [];
				for(let i in nodes) {
					if(typeof(nodes[i]) !== 'object') { continue; }
					arr.push(nodes[i]);
				}
				return arr;
			}
			
			if(self.mode == 'array' || self.mode == 'object') { 
				let obj = {};
				for(let i in nodes) {
					if(!nodes[i] || !nodes[i].tagName) {
						continue;
					}
					let tagString = self.inContext ? self.context == 'tag' ? nodes[i].tagName : '' : nodes[i].tagName;
					let id = self.inContext ? self.context == 'id' ? nodes[i].id : '' : nodes[i].id;
					id = id ? '#' + id : id;
					let classString = '';
					if(self.inContext && self.context == 'class') {
						let classes = nodes[i].className.split(' ');
						for(let i in classes) {
							if(classes[i] == '') { continue; }
							classString += '.' + classes[i];
						}
					}
					let selector = tagString + id + classString;
					obj[selector] = true;
				}
				if(self.mode == 'object') { return obj; } // Return a simple object of selectors
				let arr = [];
				for(let i in obj) {
					arr.push(i);
				}
				return arr; // Return a simple array of selectors
			}
			
		};
		
		this.mode = mode || 'array';
		this.inContext = inContext || false;
		this.context = 'tag';
		let tagHint = null;
		let tagHints = [];
		
		let contexts = {
			'#': 'id',
			'.': 'class'
		};
		
		// get context when in context mode
		let lastSeparator = selector.match(/([> #.])(?=[^> #.]*$)/);
		if(this.inContext && lastSeparator) {
			lastSeparator = lastSeparator[0];
			if(contexts[lastSeparator]) { this.context = contexts[lastSeparator]; }
		}
		
		// add _tagName attribute to all elements (make tag names searchable)
		for(let i = 0, els = document.querySelectorAll('*'), elsLength = els.length; i < elsLength; i++) {
			if(!els[i] || !els[i].tagName) { continue; }
			els[i].setAttribute('_tagName', els[i].tagName.toLowerCase());
		}
		
		// generate the new query
		let newSelector = [];
		selector.split(',').forEach(function(el, i) {
			el = el.replace(/(^|[> #.])([^> #.]*)/gi, function(match, p1, p2) {
				if(p1 != '.' && p1 != '#') {
					if(p2 == '' || p2 == '*') { return p1 + '*'; }
					return p1 + '[_tagName^=' + p2 + ']';
				}
				return p1 + p2;
			}).replace(/([#.])([a-z0-9\-_:]*)/gi, function(match, p1, p2) {
				let attr = contexts[p1];
				if(p2 == '') { return '[' + attr + ']'; }
				return '[' + attr + '*=' + p2 + ']';
			});
			newSelector.push(el);
		});
		newSelector = newSelector.join(',');
		
		// execute the query on the current page
		let nodes = document.querySelectorAll(newSelector);
		
		return this.returnNodes(nodes);
		
	}

	commands.driver.executeScript(evalSuggest, selector, 'array').then(function success(success) {
		callback({success: true, data: success});
	}).then(null, function error() {
		callback({success: false});
	});

});

exports.commands = commands;