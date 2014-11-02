var crypto = require('crypto');
var db       = require('mongodb');
var events   = require('events');
var fs       = require('fs');
var commands = require('./mate-commands').commands;
var mkdirp = require('mkdirp');
var args     = process.argv;
if(args.length < 3) { process.exit(); }

var Mate = function() {

	var self = this;

	this.campaign = {
		id: null,
		complete: false,
		timer: 0,
		limit: 5
	};
	
	this.fileName     = '';
	this.sourceData = [];
	this.step         = 0;
	this.eventEmitter = new events.EventEmitter();
	this.forceRetry   = false;

	this.stepNames = {};
	this.stepHashes = [];

	this.args = {};

	this.setCampaign = function(campaign) {

		self.campaign.id = campaign;

	};

	this.exec = function() {

		self.eventEmitter.on('save', function(fileName) {

			var content = JSON.stringify(self.data, null, '\t');
			var fileName = fileName || self.campaign.id + '-' + Date.now() + Math.random().toString().replace(/\./, '0') + '.json';

			mkdirp('output', function(err) {
				if(err) {
					console.log('There was an error saving the campaign: ' + err);
					return;
				}
				fs.writeFileSync(fileName, content, {'encoding': 'utf-8'});
			});

		});

		self.eventEmitter.on('load', function() {

			self.fileName = self.campaign.id + '.json';
			var content = fs.readFileSync(self.fileName, {'encoding': 'utf-8'});

			if(content.length == 0) {
				self.eventEmitter.emit('waitForCommands');
				return;
			}

			var newData = JSON.parse(content);
			self.data = self.data || newData;

			var newHashes = [];
			for(var i in newData) {
				newHashes[i] = crypto.createHash('md5').update(JSON.stringify(newData[i])).digest('hex');
			}

			for(var i in newHashes) {
				if(!self.stepHashes[i]) { 
					self.data[i] = newData[i];
					continue;
				}
				if(self.stepHashes[i] != newHashes[i]) {
					self.data[i] = newData[i];
					self.stepHashes[i] = newHashes[i];
				}
			}

			for(var i in newHashes) {
				self.stepHashes[i] = newHashes[i];
			}
			
			self.step = 0;
			self.eventEmitter.emit('processCommand');

		});

		self.eventEmitter.on('retry', function() {

			self.step = 0;
			self.eventEmitter.emit('load');

		});

		self.eventEmitter.on('processCommand', function() {

			var currentCommand = self.data[self.step];

			if(typeof(currentCommand) !== 'object') {
				self.eventEmitter.emit('waitForCommands');
				return;
			}

			currentCommand.processed = currentCommand.processed || false;

			if(currentCommand.setup || (currentCommand.processed && !self.forceRetry)) {
				self.eventEmitter.emit('processNextCommand');
				return;
			}

			currentCommand.data = currentCommand.data || null;
			currentCommand.waiting = true;
			currentCommand.step = self.step;
			currentCommand.performance = {
				'start': Date.now(),
				'end': null
			};
			if(currentCommand.command == 'done') {
				currentCommand._id = self.campaign.id;
			}

			if(currentCommand.name) {
				self.stepNames[currentCommand.name] = self.step;
			}

			// replace variables in data with variables from command line
			var originalCommand = null;
			if(Object.keys(self.args).length != 0) {
				originalCommand = currentCommand;
				for(var i in self.args) {
					var regexp = new RegExp('{{args\.' + i + '}}', 'g');
					currentCommand = JSON.parse(JSON.stringify(currentCommand).replace(regexp, self.args[i]));
				}
			}
			
			// Log command and data to console
			console.log('Command:     ', currentCommand.command);
			console.log('Data:        ', currentCommand.data);

			if(!commands[currentCommand.command]) {
				process.exit();
				return;
			}

			// replace the fromStep name with the real fromStep index
			var originalFromStep = currentCommand.data ? currentCommand.data.fromStep || null : null;
			if(currentCommand.data && currentCommand.data.fromStep && typeof(currentCommand.data.fromStep) == 'string') {
				if(self.stepNames[currentCommand.data.fromStep]) {
					currentCommand.data.fromStep = self.stepNames[currentCommand.data.fromStep];
				}
			}

			commands[currentCommand.command](self.data, self.step, function(res) {
				self.eventEmitter.emit('commandProcessed', res);
			});

			if(originalCommand) { currentCommand = originalCommand; }
			if(originalFromStep) { currentCommand.data.fromStep = originalFromStep; }

		});

		self.eventEmitter.on('processNextCommand', function(reason) {

			if(reason) { console.log(reason); }
			self.step++;
			if(self.step >= self.data.length) {
				self.eventEmitter.emit('waitForCommands');
				return;
			}
			self.eventEmitter.emit('processCommand');

		});

		self.eventEmitter.on('commandProcessed', function(res) {

			res = res || {};

			self.data[self.step].waiting = false;
			self.data[self.step].processed = true;
			self.data[self.step].performance.end = Date.now();

			self.data[self.step].result = res;

			var time = self.data[self.step].performance.end - self.data[self.step].performance.start;

			console.log('Time taken:   ' + time + 'ms');

			console.log(res);

			console.log('\n---\n');
			
			if(self.data[self.step].command == 'done') {
				self.eventEmitter.emit('done', res);
				return;
			}
			
			self.eventEmitter.emit('processNextCommand');

		});

		self.eventEmitter.on('done', function(res) {

			res.fileName = res.fileName || '';

			self.eventEmitter.emit('save', res.fileName);
			self.campaign.complete = true;

		});

		self.eventEmitter.on('waitForCommands', function() {

			self.campaign.timer++;
			setTimeout( function() {
				self.eventEmitter.emit('retry');
			}, 1000);

		});

		self.eventEmitter.emit('load');

	};

};

var mate = new Mate();
mate.setCampaign(args[2]);
if(args[3] && args[3] == 'force') { mate.forceRetry = true; }
for(i = 3; i < args.length; i++) {
	if(!args[i] || args[i].indexOf('--') == -1) { break; }
	var kvp = args[i].match(/--(.+)?=(.+)/);
	var k = kvp[1].replace(/[\"\=]/g, '').trim();
	var v = kvp[2].replace(/[\"\=]/g, '').trim();
	mate.args[k] = v;
}
mate.exec();

(function wait() {
	if(!mate.campaign.complete && mate.campaign.timer < mate.campaign.limit) {
		setTimeout(wait, 1000);
	}
})();
