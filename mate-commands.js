var webdriver = require('selenium-webdriver');
var driver    = new webdriver.Builder().withCapabilities(webdriver.Capabilities.phantomjs()).build();
var events    = require('events');
var fs        = require('fs');
var jexpr     = require('./lib/jexpr/jexpr.js');
var vm        = require('vm');
var nodemailer = require('nodemailer');
var transporter = nodemailer.createTransport();
var mkdirp = require('mkdirp');

var json3 = fs.readFileSync('lib/json3/json3.min.js', {encoding: 'utf8'});

driver.manage().timeouts().implicitlyWait(1000);

var commands = {

	'acceptAlert': function(data, step, callback) {

		driver.switchTo().alert().then( function success(alert) {
			alert.getText().then( function success(text) {
				alert.accept();
				callback({success: true, data: text});
			}).then(null, function error() {
				callback({success: false});
			});
		}).then(null, function error() {
			callback({success: false});
		});

	},

	'assert': function(data, step, callback) {

		var fromStep     = data[step].data.fromStep || step - 1;
		var usingExpression = data[step].data.usingExpression || null;
		var recurse      = false;
		var operator     = data[step].data.operator || 'equal';
		var expected     = data[step].data.expected || null;
		var resultData = data[fromStep].result.data || null;

		if(usingExpression) {
			resultData = jexpr(resultData, usingExpression);
		}

		this.assertItem = function(data, operator, expected) {

			var res = {
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
					var range = expected.split('-');
					var lower = parseInt(range[0]);
					var upper = parseInt(range[1]);
					if(data >= lower && data <= upper) { res.assert = true; }
				break;

			}

			res.reason.expected = aliases[operator] + ' ' + expected;
			res.reason.actual   = data;
			res.reason.message  = res.assert ? 'pass' : 'fail';

			return res;

		};

		var aliases = {
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

		var tmpData = null;

		if(typeof(resultData) === 'object' || typeof(resultData) === 'array') {

			for(var i in resultData) {

				res = this.assertItem(resultData[i], operator, expected);

				if(res.assert) { break; }

			}

		}

		else {

			console.log('just one');

			res = this.assertItem(resultData, operator, expected);

		}

		callback({data: res});

	},

	'click': function(data, step, callback) {

		var selector = data[step].data;

		driver.findElement(webdriver.By.css(selector)).then( function success(el) {
			el.click();
			callback({success: true});
		}).then( null, function error(error) {
			callback({success: false});
		});

	},

	'done': function(data, step, callback) {

		// _id is the campaign ID passed from processCommand

		var fileName = data[step].data || data[step]._id || '';
		if(fileName != '') {
			fileName = 'output/' + fileName.replace(/[\/\\\<\>\|\":?*]/g, '-');
			if(!/\.json$/.test(fileName)) { fileName += '.json'; }
		}

		callback({fileName: fileName, success: true});

	},

	'email': function(data, step, callback) {

		var fromStep = data[step].data.fromStep;
		var usingExpression = data[step].data.usingExpression || null;
		var resultData = data[fromStep].result.data;

		if(usingExpression) {
			resultData = jexpr(resultData, usingExpression);
		}

		var mailOptions = {
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

	},

	'eval': function(data, step, callback) {

		var fromStep     = data[step].data.fromStep;
		var usingExpression = data[step].data.usingExpression || null;
		var evalScript   = data[step].data.eval;
		var resultData = data[fromStep].result.data;

		if(usingExpression) {
			resultData = jexpr(resultData, usingExpression);
		}

		evalScript = '(function() {' + evalScript + '}.bind(d))()';

		var d = resultData;
		var res = eval(evalScript);

		callback({data: res, success: true});

	},

	'extractTable': function(data, step, callback) {

		var selector = data[step].data.selector || 'table';
		var options = data[step].data.options || {colCountMode: 'auto', headings: 'auto', output: 'json'};

		var evalExtractTable = function(selector, options) {

			var selector = selector || 'table';
			var options = options || {};
			options.colCountMode = options.colCountMode || 'auto'; // auto, th
			options.headings = options.headings || 'auto'; // auto, [heading1, heading2, ...]
			options.output = options.output || 'json'; // json, csv

			var table = document.querySelector(selector);

			var headings = options.headings == 'auto' ? [] : options.headings;
			var content = [];
			var cells = 0;
			var rows = 0;
			var cols = 0;

			var tr = table.querySelectorAll('tr');
			for (var i in tr) {
				if (!tr[i] || !tr.hasOwnProperty(i)) {
					continue;
				}
				if(!tr[i].querySelectorAll) { continue; }
				rows++;
				if (headings.length == 0 && options.headings == 'auto') {
					var th = tr[i].querySelectorAll('th');
					for (var j in th) {
						if (!th[j] || !th.hasOwnProperty(j) || !th[j].innerText) {
							continue;
						}
						cells++;
						headings.push(th[j].innerText);
					}
				}
				var td = tr[i].querySelectorAll('td');
				for (var j in td) {
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
				var res = [];
				for (var i = 0; i < content.length; i += cols) {
					var tmpData = content.slice(i, i + cols);
					for (var j in tmpData) {
						res.push({
							th: headings[j],
							td: tmpData[j]
						});
					}
				}
				return res;
			}

			if (options.output == 'csv') {
				var csv = '';
				csv += headings.join(',');
				for (var i = 0; i < content.length; i += cols) {
					var tmpData = content.slice(i, i + cols)
					csv += '\n' + tmpData.join(',');
				}
				return csv;
			}

		};

		driver.executeScript(evalExtractTable, selector, options).then(function success(data) {
			callback({success: true, data: data});
		}).then(null, function error(res) {
			console.log(res);
			callback({success: false});
		});

	},

	'getAttributeValues': function(data, step, callback) {

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

	},

	'getCurrentURL': function(data, step, callback) {

		driver.getCurrentUrl().then(function success(url) {
			callback({success: true, data: url});
		});

	},

	'getWindowHandle': function(data, step, callback) {

		driver.getWindowHandle().then(function success(handle) {
			callback({success: true, data: handle});
		}).then(null, function error() {
			callback({success: false});
		});

	},

	'getWindowHandles': function(data, step, callback) {

		driver.getAllWindowHandles().then(function success(handles) {
			callback({success: true, data: handles});
		}).then(null, function error() {
			callback({success: false});
		});

	},

	'matchEach': function(data, step, callback) {

		var fromStep                = data[step].data.fromStep; // required
		var usingExpression         = data[step].data.usingExpression || null;
		var matchingExpression      = data[step].data.matchingExpression; // required
		var matchingExpressionFlags = data[step].data.matchingExpressionFlags || '';
		var mode                    = data[step].data.mode || 'match';
		var resultData            = data[fromStep].result.data;

		if(usingExpression) {
			resultData = jexpr(resultData, usingExpression);
		}

		var res = [];

		var re = new RegExp(matchingExpression, matchingExpressionFlags);

		for(var i in resultData) {
			var subject = resultData[i];
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

	},

	'open': function(data, step, callback) {

		var url = data[step].data;

		driver.get(url).then(function success() {
			callback({success: true});
		}).then(null, function error() {
			callback({success: false});
		});

	},

	'repeat': function(data, step, callback) {

		data[step].data = data[step].data || {};
		var repeatSteps = data[step].data.steps || step - 1; // default previous step
		if(typeof(repeatSteps) !== 'object') { repeatSteps = [repeatSteps]; }
		var repeatTimes = data[step].data.times || 1;

		var res = [];

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

	},

	'save': function(data, step, callback) {

		var fromStep     = data[step].data.fromStep;
		var usingExpression = data[step].data.usingExpression || null;
		var fileName     = data[step].data.fileName || new Date().getTime() + Math.random().toString().replace(/\./, '0');
		var fileType     = data[step].data.fileType || 'json';
		var resultData = data[fromStep].result.data;

		if(usingExpression) {
			resultData = jexpr(resultData, usingExpression);
		}

		fileName = fileName.replace(/[\/\\\<\>\|\":?*]/g, '-');

		fileName = 'commands/save/' + fileName + '.' + fileType;

		var saveData = '';
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

	},

	'screenshot': function(data, step, callback) {

		var fileName = data[step].data;

		fileName = fileName || new Date().getTime() + Math.random().toString().replace(/\./, '0') + '.png';
		fileName = 'commands/screenshot/' + fileName;

		mkdirp('commands/screenshot', function(err) {
			if(err) {
				callback({success: false, error: err});
				return;
			}
			driver.takeScreenshot().then( function success(data) {
				fs.writeFileSync(fileName, data, {'encoding': 'base64'});
				callback({
					data: {
						'filename': fileName
					},
					success: true
				});
			});
		});

	},

	'scrollPageTo': function(data, step, callback) {

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

			driver.executeScript(evalScroll, to).then( function(scrollTop) {
				self.eventEmitter.emit('processScroll', scrollTop);
			});

		});

		this.eventEmitter.on('processScroll', function(scrollTop) {

			var processScrollTime = Math.floor(Date.now() / 1000);
			scrolls++;

			console.log('Scrolled to ' + scrollTop);

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

	},

	'scrollPageToEnd': function(data, step, callback) {

		data[step].data = data[step].data || {};
		data[step].data.to = 'end';

		commands.scrollPageTo(data, step, callback);

	},

	'scrollPageToHome': function(data, step, callback) {

		data[step].data = data[step].data || {};
		data[step].data.to = 'home';

		commands.scrollPageTo(data, step, callback);

	},

	'search': function(data, step, callback) {

		var searchText = data[step].data || 'mate';
		data[step].data = {};
		data[step].data.selector = 'input[name=q]';
		data[step].data.string = searchText + webdriver.Key.RETURN;

		commands.sendKeys(data, step, callback);

	},

	'select': function(data, step, callback) {

		var selector = data[step].data || 'body';
		var details = true;
		if(typeof(selector) === 'object') {
			selector = selector.selector || 'body';
			details = selector.details || true;
		}

		var evalSelect = function(selector, json3) {

			if(!document.querySelector('script#mateJSON3')) {

				var script = document.createElement('script');
				script.id = 'mateJSON3';
				script.innerText = json3;

				document.querySelector('head').appendChild(script);

			}

			var els = getElementEssentials(selector);
			return els;

			function getElementEssentials(selector) {

				var thisEl = document.querySelector(selector);

				var tmpEl = {};

				for(var i in thisEl) {

					var thisProp = thisEl[i];

					if(/array|object|function/.test(typeof(thisProp))) { continue; }

					tmpEl[i] = thisProp;

				}

				return JSON.stringify([tmpEl]);

			}

		};

		driver.findElement(webdriver.By.css(selector)).then( function success(el) {

			if(details) {

				driver.executeScript(evalSelect, selector, json3).then( function success(nativeEl) {
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

	},

	'selectAll': function(data, step, callback) {

		var selector = data[step].data || 'body';
		var details = true;
		if(typeof(selector) === 'object') {
			selector = selector.selector || 'body';
			details = selector.details || true;
		}

		var evalSelectAll = function(selector, json3) {

			if(!document.querySelector('script#mateJSON3')) {

				var script = document.createElement('script');
				script.id = 'mateJSON3';
				//script.src = '//cdnjs.cloudflare.com/ajax/libs/json3/3.3.2/json3.js';
				script.innerText = json3;

				document.querySelector('head').appendChild(script);

			}

			var els = getElementEssentials(selector);
			return els;

			function getElementEssentials(selector) {

				var els = document.querySelectorAll(selector);

				var els2 = [];

				for(var i in els) {

					if(!els.hasOwnProperty(i)) { continue; }

					var thisEl = els[i];
					var tmpEl = {};

					for(var j in thisEl) {

						var thisProp = thisEl[j];

						if(/array|object|function/.test(typeof(thisProp))) { continue; }

						tmpEl[j] = thisProp;

					}

					els2.push(tmpEl);

				}

				return JSON3.stringify(els2);

			}

		};

		driver.findElements(webdriver.By.css(selector)).then( function success(els) {

			if(details) {

				driver.executeScript(evalSelectAll, selector, json3).then( function success(nativeEls) {
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

	},

	'sendKeys': function(data, step, callback) {

		var data = data[step].data;

		var self = this;

		this.eventEmitter = new events.EventEmitter();

		var selector = data.selector;
		var string = data.string;

		driver.findElement(webdriver.By.css(selector)).sendKeys(string).then( function success() {
			callback({success: true});
		}).then(null, function error(message) {
			callback({success: false});
		});

	},

	'setImplicitWaitTimeout': function(data, step, callback) {

		var ms = data[step].data || 1000;

		driver.manage().timeouts().implicitlyWait(ms);

		callback({success: true});

	},

	'setWindow': function(data, step, callback) {

		var handle = data[step].data;

		driver.switchTo().window(handle).then(function success() {
			callback({success: true});
		}).then(null, function error() {
			callback({success: false});
		});

	},

	'submitForm': function(data, step, callback) {

		var selector = data[step].data || 'form';

		var evalSubmit = function(selector) {
			document.querySelector(selector).submit();
			return true;
		};

		driver.executeScript(evalSubmit, selector).then(function success() {
			callback({success: true});
		}).then(null, function error() {
			callback({success: false});
		});

	},

	'suggestSelector': function(data, step, callback) {

		var selector = data[step].data;

		var evalSuggest = function(selector, mode, inContext) {
	
			var self = this;
			
			this.returnNodes = function(nodes) {
				
				if(self.mode == 'native') {
					// Return an array of native elements
					var arr = [];
					for(var i in nodes) {
						if(typeof(nodes[i]) !== 'object') { continue; }
						arr.push(nodes[i]);
					}
					return arr;
				}
				
				if(self.mode == 'array' || self.mode == 'object') { 
					var obj = {};
					for(var i in nodes) {
						if(!nodes[i] || !nodes[i].tagName) {
							continue;
						}
						var tagString = self.inContext ? self.context == 'tag' ? nodes[i].tagName : '' : nodes[i].tagName;
						var id = self.inContext ? self.context == 'id' ? nodes[i].id : '' : nodes[i].id;
						id = id ? '#' + id : id;
						var classString = '';
						if(self.inContext && self.context == 'class') {
							var classes = nodes[i].className.split(' ');
							for(var i in classes) {
								if(classes[i] == '') { continue; }
								classString += '.' + classes[i];
							}
						}
						var selector = tagString + id + classString;
						obj[selector] = true;
					}
					if(self.mode == 'object') { return obj; } // Return a simple object of selectors
					var arr = [];
					for(var i in obj) {
						arr.push(i);
					}
					return arr; // Return a simple array of selectors
				}
				
			};
			
			this.mode = mode || 'array';
			this.inContext = inContext || false;
			this.context = 'tag';
			var tagHint = null;
			var tagHints = [];
			
			var contexts = {
				'#': 'id',
				'.': 'class'
			};
			
			// get context when in context mode
			var lastSeparator = selector.match(/([> #.])(?=[^> #.]*$)/);
			if(this.inContext && lastSeparator) {
				lastSeparator = lastSeparator[0];
				if(contexts[lastSeparator]) { this.context = contexts[lastSeparator]; }
			}
			
			// add _tagName attribute to all elements (make tag names searchable)
			for(var i = 0, els = document.querySelectorAll('*'), elsLength = els.length; i < elsLength; i++) {
				if(!els[i] || !els[i].tagName) { continue; }
				els[i].setAttribute('_tagName', els[i].tagName.toLowerCase());
			}
			
			// generate the new query
			var newSelector = [];
			selector.split(',').forEach(function(el, i) {
				el = el.replace(/(^|[> #.])([^> #.]*)/gi, function(match, p1, p2) {
					if(p1 != '.' && p1 != '#') {
						if(p2 == '' || p2 == '*') { return p1 + '*'; }
						return p1 + '[_tagName^=' + p2 + ']';
					}
					return p1 + p2;
				}).replace(/([#.])([a-z0-9\-_:]*)/gi, function(match, p1, p2) {
					var attr = contexts[p1];
					if(p2 == '') { return '[' + attr + ']'; }
					return '[' + attr + '*=' + p2 + ']';
				});
				newSelector.push(el);
			});
			newSelector = newSelector.join(',');
			
			// execute the query on the current page
			var nodes = document.querySelectorAll(newSelector);
			
			return this.returnNodes(nodes);
			
		}

		driver.executeScript(evalSuggest, selector, 'array').then(function success(success) {
			callback({success: true, data: success});
		}).then(null, function error() {
			callback({success: false});
		});

	}

};

exports.commands = commands;