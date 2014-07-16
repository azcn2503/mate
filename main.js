var db = require('mongodb');
var events = require('events');
var eventEmitter = new events.EventEmitter();
var fs = require('fs');
var webdriver = require('selenium-webdriver');

var args = process.argv;
if(args.length < 3) { process.exit(); }

var driver = new webdriver.Builder()
	.withCapabilities(webdriver.Capabilities.phantomjs())
	.build();

var campaign = {
	'id': args[2],
	'complete': false,
	'timer': 0,
	'limit': 5
};

var commands = {

	'click': function(selector, callback) {

		driver.findElement(webdriver.By.css(selector)).click();

		callback();

	},

	'done': function(data, callback) {

		callback({});

	},

	'open': function(url, callback) {

		var evalGetUrl = function() {
			return location.href;
		};

		driver.get(url);
		driver.executeScript(evalGetUrl).then( function(actualUrl) {
			callback({'url': actualUrl});
		});

	},

	'screenshot': function(filename, callback) {

		filename = filename || new Date().getTime() + Math.random().toString().replace(/\./, '0') + '.png';
		filename = 'screenshots/' + filename;

		driver.takeScreenshot().then( function(data) {
			fs.writeFileSync(filename, data, {'encoding': 'base64'});
			callback({'filename': filename});
		});

	},

	'scrollPageToEnd': function(data, callback) {

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

	'select': function(selector, callback) {

		driver.findElement(webdriver.By.css(selector)).then( function(el) {
			callback({'count': true});
		});

	},

	'selectAll': function(selector, callback) {

		driver.findElements(webdriver.By.css(selector)).then( function(els) {
			callback({'count': els.length});
		});

	},

	'sendKeys': function(data, callback) {

		var self = this;

		this.eventEmitter = new events.EventEmitter();

		var selector = data.selector;
		var string = data.string;

		driver.findElement(webdriver.By.css(selector)).sendKeys(string);

		callback();

	}

};

var Mate = function() {

	this.fileName = '';
	this.data = [];
	this.step = 0;

	this.eventEmitter = new events.EventEmitter();

	var self = this;

	this.eventEmitter.on('save', function() {
		fs.writeFileSync(self.fileName, JSON.stringify(self.data, null, '\t'), {'encoding': 'utf-8'});
	});

	this.eventEmitter.on('load', function() {
		//console.log('Loading...');
		self.fileName = campaign.id + '.json';
		var content = fs.readFileSync(self.fileName, {'encoding': 'utf-8'});
		self.data = JSON.parse(content);
		self.step = 0;
		self.eventEmitter.emit('processCommand');
	});

	this.eventEmitter.on('processCommand', function() {
		self.data[self.step].processed = self.data[self.step].processed || false;
		if(self.data[self.step].processed) {
			self.eventEmitter.emit('processNextCommand');
			return;
		}
		self.data[self.step].data = self.data[self.step].data || null;
		self.data[self.step].waiting = true;
		self.eventEmitter.emit('main.save');
		console.log('Command: ', self.data[self.step].command);
		console.log('Data:    ', self.data[self.step].data);
		if(!commands[self.data[self.step].command]) {
			self.eventEmitter.emit('processNextCommand', 'Command `' + self.data[self.step].command + '` does not exist');
			return;
		};
		commands[self.data[self.step].command](self.data[self.step].data, function(res) {
			self.eventEmitter.emit('commandProcessed', res);
		});
	});

	this.eventEmitter.on('processNextCommand', function(reason) {
		if(reason) { console.log(reason); }
		self.step++;
		if(self.step >= self.data.length) { 
			self.eventEmitter.emit('waitForCommands');
			return;
		}
		self.eventEmitter.emit('processCommand');
	});

	this.eventEmitter.on('commandProcessed', function(res) {
		res = res || {};
		res.command = self.data[self.step].command;
		console.log(JSON.stringify(res));
		self.data[self.step].waiting = false;
		self.data[self.step].processed = true;
		self.eventEmitter.emit('save');
		if(self.data[self.step].command == 'done') {
			self.eventEmitter.emit('done');
			return;
		}
		self.eventEmitter.emit('processNextCommand');
	});

	this.eventEmitter.on('done', function() {
		campaign.complete = true;
	});

	this.eventEmitter.on('waitForCommands', function() {
		//console.log('Waiting for commands...');
		campaign.timer++;
		setTimeout( function() {
			self.eventEmitter.emit('load');
		}, 1000);
	});

	this.eventEmitter.emit('load');

};

var mate = new Mate();

(function wait() {
	if(!campaign.complete && campaign.timer < campaign.limit) {
		setTimeout(wait, 1000);
	}
})();