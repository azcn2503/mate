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

		callback({});

	},

	'getAttributeValues': function(data, step, callback) {

		var fromStep = data[step].data.fromStep;
		var fromStepData = data[fromStep].result.elements || data[fromStep].result.element || data[fromStep].result.data;
		var attributeName = data[step].data.attributeName;

		var res = [];

		for(var i in fromStepData) {
			if(fromStepData[i][attributeName]) {
				//console.log(attributeName, fromStepData[i][attributeName]);
				res.push(fromStepData[i][attributeName]);
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
			callback({'url': actualUrl});
		});

	},

	'screenshot': function(data, step, callback) {

		var filename = data[step].data;

		filename = filename || new Date().getTime() + Math.random().toString().replace(/\./, '0') + '.png';
		filename = 'screenshots/' + filename;

		driver.takeScreenshot().then( function(data) {
			fs.writeFileSync(filename, data, {'encoding': 'base64'});
			callback({'filename': filename});
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
			if(callback) { callback({'scrollTop': scrollTop}); }
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
					'element': JSON.parse(nativeEl)
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
					'elements': JSON.parse(nativeEls)
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