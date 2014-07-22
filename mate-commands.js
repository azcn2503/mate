var webdriver = require('selenium-webdriver');
var driver = new webdriver.Builder()
	.withCapabilities(webdriver.Capabilities.phantomjs())
	.build();
var events = require('events');
var fs = require('fs');

var commands = {

	'click': function(data, step, callback) {

		var selector = data[step].data;

		driver.findElement(webdriver.By.css(selector)).click();

		callback();

	},

	'done': function(data, step, callback) {

		callback();

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

		var fromStep                = data[step].data.fromStep; // required
		var attributeName           = data[step].data.attributeName; // required
		var matchingExpression      = data[step].data.matchingExpression || null;
		var matchingExpressionFlags = data[step].data.matchingExpressionFlags || '';
		var fromStepData            = data[fromStep].result.data.elements || data[fromStep].result.data.element || data[fromStep].result.data;

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

		var evalGetUrl = function() {
			return location.href;
		};

		driver.get(url);
		driver.executeScript(evalGetUrl).then( function(actualUrl) {
			callback({
				data: {
					'url': actualUrl
				}
			});
		});

	},

	'repeat': function(data, step, callback) {

		var repeatStep = data[step].data;
		var repeatCommand = data[repeatStep].command;

		commands[repeatCommand](data, repeatStep, callback);

	},

	'save': function(data, step, callback) {

		var fromStep     = data[step].data.fromStep;
		var fileName     = data[step].data.fileName || new Date().getTime() + Math.random().toString().replace(/\./, '0') + '.json';
		var fromStepData = data[fromStep].result.data;

		fileName = 'commands/save/' + fileName;

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

		var data = data[step].data;

		var self = this;

		this.eventEmitter = new events.EventEmitter();

		var data = data || {};

		var evalScroll = function() {
			window.scrollTo(0, document.body.scrollHeight);
			return document.body.scrollTop;
		};

		this.eventEmitter.on('scroll', function() {

			data.prevScrollTop = data.prevScrollTop || 0;
			data.tries = data.tries || 0;
			data.tryLimit = data.tryLimit || 5;

			driver.executeScript(evalScroll).then( function(scrollTop) {
				self.eventEmitter.emit('processScroll', scrollTop);
			});

		});

		this.eventEmitter.on('processScroll', function(scrollTop) {

			console.log('Scrolled to ' + scrollTop);

			data.scrollTop = scrollTop;

			if(data.scrollTop == data.prevScrollTop) {
				data.tries++;
			}
			else {
				data.tries = 0;
			}

			data.prevScrollTop = scrollTop;

			if(data.tries >= data.tryLimit) {
				self.eventEmitter.emit('done', scrollTop);
				return;
			}
			else {
				setTimeout( function() {
					self.eventEmitter.emit('scroll');
				}, 1000);
			}

		});

		this.eventEmitter.on('done', function(scrollTop) {

			data.prevScrollTop = scrollTop;
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

		var selector = data[step].data;

		var evalSelect = function(selector) {

			function getElementEssentials(orig, tmp, level) {
			    var tmp = tmp || {};
			    var level = level || 0;
			    for(var i in orig) {
			    	if(i == 'selectionDirection' || i == 'selectionEnd' || i == 'selectionStart') { continue; }
			        if(!orig[i]) { continue; }
			        if(!i.match(/[a-z]/)) { continue; }
			        if(typeof(orig[i]) === 'function' || typeof(orig[i]) === 'object' || level > 1) { continue; }
			        if(typeof(orig[i]) === 'array') { level++; get(orig[i], tmp, level); continue; }
			        tmp[i] = orig[i];
			        continue;
			    }
			    return tmp;
			}

			var el = document.querySelector(selector);

			var el2 = getElementEssentials(el);

			var elStringified = JSON.stringify(el2);

			return elStringified;

		};

		driver.findElement(webdriver.By.css(selector)).then( function(el) {

			driver.executeScript(evalSelect, selector).then( function(nativeEl) {
				callback({
					data: {
						'element': JSON.parse(nativeEl)
					}
				});
			});

		});

	},

	'selectAll': function(data, step, callback) {

		var selector = data[step].data;

		var evalSelectAll = function(selector) {

			function getElementEssentials(orig, tmp, level) {
			    var tmp = tmp || {};
			    var level = level || 0;
			    for(var i in orig) {
			    	if(i == 'selectionDirection' || i == 'selectionEnd' || i == 'selectionStart') { continue; }
			        if(!orig[i]) { continue; }
			        if(!i.match(/[a-z]/)) { continue; }
			        if(typeof(orig[i]) === 'function' || typeof(orig[i]) === 'object' || level > 1) { continue; }
			        if(typeof(orig[i]) === 'array') { level++; get(orig[i], tmp, level); continue; }
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

		driver.findElements(webdriver.By.css(selector)).then( function(els) {

			driver.executeScript(evalSelectAll, selector).then( function(nativeEls) {
				callback({
					data: {
						'elements': JSON.parse(nativeEls)
					}
				});
			});

		});

	},

	'sendKeys': function(data, step, callback) {

		var data = data[step].data;

		var self = this;

		this.eventEmitter = new events.EventEmitter();

		var selector = data.selector;
		var string = data.string;

		driver.findElement(webdriver.By.css(selector)).sendKeys(string);

		callback();

	}

};

exports.commands = commands;