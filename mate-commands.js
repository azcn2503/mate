var webdriver = require('selenium-webdriver');
var driver    = new webdriver.Builder().withCapabilities(webdriver.Capabilities.phantomjs()).build();
var events    = require('events');
var fs        = require('fs');

driver.manage().timeouts().implicitlyWait(1000);

var commands = {

	'assert': function(data, step, callback) {

		var fromStep     = data[step].data.fromStep || step - 1;
		var fromIndex    = data[step].data.fromIndex || 0;
		var recurse      = false;
		var operator     = data[step].data.operator || 'equal';
		var expected     = data[step].data.expected || null;
		var fromStepData = data[fromStep].result.data || null;
		if(typeof(fromStepData) === 'array' || typeof(fromStepData) === 'object') {
			if(typeof(fromIndex) === 'array' || typeof(fromIndex) === 'object') {
				for(var i in fromIndex) {
					fromStepData = fromStepData[fromIndex[i]] || fromStepData;
				}
			}
			if(fromIndex == '*' || !fromIndex) {
				fromIndex = 0;
				recurse = true;
			}
		}

		var res = {
			assert: false,
			reason: {
				message  : '',
				expected : '',
				actual   : '',
				index    : null
			}
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

		do {

			var tmpData = recurse ? fromStepData[fromIndex] : fromStepData;

			if(expected == null || tmpData == null) {
				res = false;
				break;
			}

			switch(operator) {

				case 'equal':
					if(tmpData == expected) { res.assert = true; }
				break;

				case 'gt':
					if(tmpData > expected) { res.assert = true; }
				break;

				case 'gte':
					if(tmpData >= expected) { res.assert = true; }
				break;

				case 'lt':
					if(tmpData < expected) { res.assert = true; }
				break;

				case 'lte':
					if(tmpData <= expected) { res.assert = true; }
				break;

				case 'null':
					if(tmpData === null) { res.assert = true; }
				break;

				case 'notnull':
					if(tmpData !== null) { res.assert = true; }
				break;

				case 'contains':
					if(tmpData.indexOf(expected) != -1) { res.assert = true; }
				break;

				case 'notcontains':
					if(tmpData.indexOf(expected) == -1) { res.assert = true; }
				break;

				case 'inrange':
					var range = expected.split('-');
					var lower = parseInt(range[0]);
					var upper = parseInt(range[1]);
					if(tmpData >= lower && tmpData <= upper) { res.assert = true; }
				break;

			}

			res.reason.expected = aliases[operator] + ' ' + expected;
			res.reason.actual   = tmpData;
			res.reason.message  = res.assert ? 'pass' : 'fail';
			res.reason.index    = fromIndex;

			fromIndex++;

		} while(!res.assert && recurse && fromIndex < fromStepData.length - 1);

		callback({data: res});

	},

	'click': function(data, step, callback) {

		var selector = data[step].data;

		driver.findElement(webdriver.By.css(selector)).click();

		callback({success: true});

	},

	'done': function(data, step, callback) {

		callback({success: true});

	},

	'evalEach': function(data, step, callback) {

		var fromStep     = data[step].data.fromStep;
		var evalScript   = data[step].data.eval;
		var fromStepData = data[fromStep].result.data;

		var res = [];

		evalScript = '(function() {' + evalScript + '}.bind(s))()';

		for(var i in fromStepData) {
			var s = fromStepData[i];
			res.push(eval(evalScript));
		}

		callback({data: res});

	},

	'getAttributeValues': function(data, step, callback) {

		var fromStep                = data[step].data.fromStep || step - 1; // required
		var attributeName           = data[step].data.attributeName; // required
		var matchingExpression      = data[step].data.matchingExpression || null;
		var matchingExpressionFlags = data[step].data.matchingExpressionFlags || '';
		var fromStepData            = data[fromStep].result.data;
		//if(typeof(fromStepData) === 'object') { fromStepData = [fromStepData]; }

		var res = [];

		for(var i in fromStepData) {
			if(fromStepData[i][attributeName]) {
				if(matchingExpression) {
					var re = new RegExp(matchingExpression, matchingExpressionFlags);
					if(!re.test(fromStepData[i][attributeName])) { continue; }
				}
				res.push(fromStepData[i][attributeName]);
			}
		}

		callback({data: res});

	},

	'getCurrentURL': function(data, step, callback) {

		driver.getCurrentUrl().then(function success(url) {
			callback({data: url});
		});

	},

	'getWindowHandle': function(data, step, callback) {

		driver.getWindowHandle().then(function success(handle) {
			callback({data: handle});
		}).then(null, function error() {
			callback({success: false});
		});

	},

	'getWindowHandles': function(data, step, callback) {

		driver.getAllWindowHandles().then(function success(handles) {
			callback({data: handles});
		}).then(null, function error() {
			callback({success: false});
		});

	},

	'acceptAlert': function(data, step, callback) {

		driver.switchTo().alert().then( function success(alert) {
			alert.getText().then( function success(text) {
				alert.accept();
				callback({data: text});
			}).then(null, function error() {
				callback({success: false});
			});
		}).then(null, function error() {
			callback({success: false});
		});

	},

	'matchEach': function(data, step, callback) {

		var fromStep                = data[step].data.fromStep; // required
		var matchingExpression      = data[step].data.matchingExpression; // required
		var matchingExpressionFlags = data[step].data.matchingExpressionFlags || '';
		var mode                    = data[step].data.mode || 'match';
		var fromStepData            = data[fromStep].result.data;

		var res = [];

		var re = new RegExp(matchingExpression, matchingExpressionFlags);

		for(var i in fromStepData) {
			if(!re.test(fromStepData[i])) { continue; }
			if(mode == 'full') {
				res.push(fromStepData[i]);
			}
			if(mode == 'array') {
				res.push(fromStepData[i].match(re));
			}
			if(mode == 'match') {
				res.push(fromStepData[i].match(re)[0]);
			}
		}

		callback({data: res});

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

		var repeatStep    = data[step].data;
		var repeatCommand = data[repeatStep].command;

		commands[repeatCommand](data, repeatStep, callback);

	},

	'save': function(data, step, callback) {

		var fromStep     = data[step].data.fromStep;
		var fromIndex    = data[step].data.fromIndex || 0;
		var fileName     = data[step].data.fileName || new Date().getTime() + Math.random().toString().replace(/\./, '0');
		var fileType     = data[step].data.fileType || 'json';
		var fromStepData = data[fromStep].result.data;
		if(typeof(fromStepData) === 'array' || typeof(fromStepData) === 'object') {
			console.log('fromStepData is an array or object');
			console.log('fromIndex is ', fromIndex);
			if(typeof(fromIndex) === 'array' || typeof(fromIndex) === 'object') {
				for(var i in fromIndex) {
					fromStepData = fromStepData[fromIndex[i]] || fromStepData;
				}
			}
			else {
				if(fileType != 'json') {
					fromStepData = fromStepData[fromIndex];
				}
			}
		}

		fileName = 'commands/save/' + fileName + '.' + fileType;

		var saveData = '';
		if(fileType == 'json') { saveData = JSON.stringify(fromStepData); }
		else { saveData = fromStepData; }

		fs.writeFileSync(fileName, JSON.stringify(fromStepData), {'encoding': 'utf-8'});

		callback({
			data: {
				'filename': fileName
			}
		});

	},

	'screenshot': function(data, step, callback) {

		var fileName = data[step].data;

		fileName = fileName || new Date().getTime() + Math.random().toString().replace(/\./, '0') + '.png';
		fileName = 'commands/screenshot/' + fileName;

		driver.takeScreenshot().then( function(data) {
			fs.writeFileSync(fileName, data, {'encoding': 'base64'});
			callback({
				data: {
					'filename': fileName
				}
			});
		});

	},

	'scrollPageToEnd': function(data, step, callback) {

		var self          = this;
		var data          = data[step].data || {};
		var timeout       = data.timeout || 60;
		var scrolls       = 0;
		var maxScrolls    = data.maxScrolls || null;
		var maxRetries    = data.maxRetries || 5;
		var startTime     = Math.floor(Date.now() / 1000);
		var prevScrollTop = 0;
		var tries         = 0;
		var scrollTop     = 0;

		this.eventEmitter = new events.EventEmitter();

		var evalScroll = function() {
			window.scrollTo(0, document.body.scrollHeight);
			return document.body.scrollTop;
		};

		this.eventEmitter.on('scroll', function() {

			driver.executeScript(evalScroll).then( function(scrollTop) {
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
			if(callback) { callback({
				data: {
					'scrollTop': scrollTop
				}
			}); }
			return;

		});

		this.eventEmitter.emit('scroll');
		return;

	},

	'select': function(data, step, callback) {

		var selector = data[step].data || 'body';
		var details = true;
		if(typeof(selector) === 'object') {
			selector = selector.selector || 'body';
			details = selector.details || true;
		}

		var evalSelect = function(selector) {

			function getElementEssentials(orig, tmp, level) {
				var tmp = tmp || {};
				var level = level || 0;
				for (var i in orig) {
					if (i == 'selectionDirection' || i == 'selectionEnd' || i == 'selectionStart') {
						continue;
					}
					if (!orig[i]) {
						continue;
					}
					if (!i.match(/[a-z]/)) {
						continue;
					}
					if (typeof (orig[i]) === 'function' || level > 0) {
						continue;
					}
					if (typeof (orig[i]) === 'array' || typeof (orig[i]) === 'object') {
						tmp[i] = getElementEssentials(orig[i], null, level + 1);
						continue;
					}
					tmp[i] = orig[i];
					continue;
				}
				return tmp;
			}

			var el = document.querySelector(selector);

			var el2 = [getElementEssentials(el)];

			var elStringified = JSON.stringify(el2);

			return elStringified;

		};

		driver.findElement(webdriver.By.css(selector)).then( function success(el) {

			if(details) {

				driver.executeScript(evalSelect, selector).then( function success(nativeEl) {
					callback({
						data: JSON.parse(nativeEl)
					});
				}).then(null, function error() {
					callback({success: false});
				});

			}

			else {

				callback({success: true});

			}

		}).then(null, function error() {
			callback({success: false});
		});

	},

	'selectAll': function(data, step, callback) {

		var selector = data[step].data || 'body';
		var details = true;
		if(typeof(selector) === 'object') {
			selector = selector.selector || 'body';
			details = selector.details || true;
		}

		var evalSelectAll = function(selector) {

			function getElementEssentials(orig, tmp, level) {
				var tmp = tmp || {};
				var level = level || 0;
				for (var i in orig) {
					if (i == 'selectionDirection' || i == 'selectionEnd' || i == 'selectionStart') {
						continue;
					}
					if (!orig[i]) {
						continue;
					}
					if (!i.match(/[a-z]/)) {
						continue;
					}
					if (typeof (orig[i]) === 'function' || level > 0) {
						continue;
					}
					if (typeof (orig[i]) === 'array' || typeof (orig[i]) === 'object') {
						tmp[i] = getElementEssentials(orig[i], null, level + 1);
						continue;
					}
					tmp[i] = orig[i];
					continue;
				}
				return tmp;
			}

			var els = document.querySelectorAll(selector);
			
			var els2 = [];
			for(var i in els) {
				els2.push(getElementEssentials(els[i]));
			}

			//var els2 = {test1: true, test2: [1, 2, 3], test3: [false]};

			var elsStringified = JSON.stringify(els2);

			return elsStringified;

		};

		driver.findElements(webdriver.By.css(selector)).then( function success(els) {

			if(details) {

				driver.executeScript(evalSelectAll, selector).then( function success(nativeEls) {
					callback({
						data: JSON.parse(nativeEls)
					});
				}).then(null, function error() {
					callback({success: false})
				});

			}

			else{

				callback({success: true});

			}

		}).then(null, function error() {
			callback({success: false});
		});

	},

	'sendKeys': function(data, step, callback) {

		var data = data[step].data;

		var self = this;

		this.eventEmitter = new events.EventEmitter();

		var selector = data.selector;
		var string = data.string;

		driver.findElement(webdriver.By.css(selector)).sendKeys(string);

		callback({success: true});

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

		driver.executeScript(submitForm, selector).then(function success() {
			callback({success: true});
		}).then(null, function error() {
			callback({success: false});
		});

	}

};

exports.commands = commands;