var db = require('mongodb');
var events = require('events');
var fs = require('fs');
var commands = require('./mate-commands').commands;

var args = process.argv;
if(args.length < 3) { process.exit(); }

var Mate = function() {

	var self = this;

	this.campaign = {
		id: null,
		complete: false,
		timer: 0,
		limit: 5
	};
	this.fileName = '';
	this.data = [];
	this.step = 0;
	this.eventEmitter = new events.EventEmitter();
	this.forceRetry = false;

	this.setCampaign = function(campaign) {

		self.campaign.id = campaign;

	};

	this.exec = function() {

		self.eventEmitter.on('save', function() {

			fs.writeFileSync(self.fileName, JSON.stringify(self.data, null, '\t'), {'encoding': 'utf-8'});

		});

		self.eventEmitter.on('load', function() {

			self.fileName = self.campaign.id + '.json';
			var content = fs.readFileSync(self.fileName, {'encoding': 'utf-8'});
			self.data = JSON.parse(content);
			self.step = 0;
			self.eventEmitter.emit('processCommand');

		});

		self.eventEmitter.on('processCommand', function() {

			self.data[self.step].processed = self.data[self.step].processed || false;
			if(self.data[self.step].processed && !self.forceRetry) {
				self.eventEmitter.emit('processNextCommand');
				return;
			}
			self.data[self.step].data = self.data[self.step].data || null;
			self.data[self.step].waiting = true;
			self.data[self.step].step = self.step;
			self.data[self.step].performance = {
				'start': Date.now(),
				'end': null
			};

			self.eventEmitter.emit('save');
			
			console.log('Command: ', self.data[self.step].command);
			console.log('Data:    ', self.data[self.step].data);
			if(!commands[self.data[self.step].command]) {
				self.eventEmitter.emit('processNextCommand', 'Command `' + self.data[self.step].command + '` does not exist');
				return;
			};
			commands[self.data[self.step].command](self.data, self.step, function(res) {
				self.eventEmitter.emit('commandProcessed', res);
			});

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

			console.log(res);
			console.log('\n---\n');

			self.data[self.step].waiting = false;
			self.data[self.step].processed = true;
			self.data[self.step].result = res;
			self.data[self.step].performance.end = Date.now();
			self.eventEmitter.emit('save');
			
			if(self.data[self.step].command == 'done') {
				self.eventEmitter.emit('done');
				return;
			}
			
			self.eventEmitter.emit('processNextCommand');

		});

		self.eventEmitter.on('done', function() {

			self.campaign.complete = true;

		});

		self.eventEmitter.on('waitForCommands', function() {

			self.campaign.timer++;
			setTimeout( function() {
				self.eventEmitter.emit('load');
			}, 1000);

		});

		self.eventEmitter.emit('load');

	};

};

var mate = new Mate();
mate.setCampaign(args[2]);
if(args[3] && args[3] == 'force') { mate.forceRetry = true; }
mate.exec();

(function wait() {
	if(!mate.campaign.complete && mate.campaign.timer < mate.campaign.limit) {
		setTimeout(wait, 1000);
	}
})();
