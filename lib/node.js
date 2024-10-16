var geoip = require('geoip-lite');
var _ = require('lodash');
var trusted = require('./utils/config').trusted;

var MAX_HISTORY = 40;
var MAX_INACTIVE_TIME = 1000*60*60*4;

var Node = function(data)
{
	this.id = null;
	this.trusted = false;
	this.info = {};
	this.geo = {}
	this.stats = {
		active: false,
		peers: 0,
		pending: 0,
		gasPrice: 0,
		block: {
			number: 0,
			difficulty: 0,
			gasUsed: 0,
			hash: '0x0000000000000000000000000000000000000000000000000000000000000000',
			totalDifficulty: 0,
			transactions: [],
			uncles: []
		},
		syncing: false,
		uptime: 100,
		blockTransactionCount: 0,
		blockUncleCount: 0,
		propagationAvg: 0,
		latency: 0,
		uptime: 100
	};

	this.history = new Array(MAX_HISTORY);

	this.uptime = {
		started: null,
		up: 0,
		down: 0,
		lastStatus: null,
		lastUpdate: null
	};

	this.init(data);

	return this;
}

Node.prototype.init = function(data)
{
	_.fill(this.history, -1);

	if( this.id === null && this.uptime.started === null )
		this.setState(true);

	this.id = _.result(data, 'id', this.id);

	if( !_.isUndefined(data.latency) )
		this.stats.latency = data.latency;

	this.setInfo(data, null);
}

Node.prototype.setInfo = function(data, callback)
{
	if( !_.isUndefined(data.info) )
	{
		this.info = data.info;

		if( !_.isUndefined(data.info.canUpdateHistory) )
		{
			this.info.canUpdateHistory = _.result(data, 'info.canUpdateHistory', false);
		}
	}

	if( !_.isUndefined(data.ip) )
	{
		if( trusted.indexOf(data.ip) >= 0 || process.env.LITE === 'true')
		{
			this.trusted = true;
		}

		this.setGeo(data.ip);
	}

	this.spark = _.result(data, 'spark', null);

	this.setState(true);

	if(callback !== null)
	{
		callback(null, this.getInfo());
	}
}

Node.prototype.setGeo = function(ip)
{
	if (ip.substr(0, 7) == "::ffff:") {
		ip = ip.substr(7)
        }
	this.info.ip = ip;
	this.geo = geoip.lookup(ip);
}

Node.prototype.getInfo = function(callback)
{
	return {
		id: this.id,
		info: this.info,
		stats: {
			active: this.stats.active,
			syncing: this.stats.syncing,
			peers: this.stats.peers,
			gasPrice: this.stats.gasPrice,
			block: this.stats.block,
			propagationAvg: this.stats.propagationAvg,
			uptime: this.stats.uptime,
			latency: this.stats.latency,
			pending: this.stats.pending,
		},
		history: this.history,
		geo: this.geo
	};
}

Node.prototype.setStats = function(stats, history, callback) {
    // Log the incoming stats object
    console.log("Received stats object:", stats);

    if (!_.isUndefined(stats)) {
        // Set the block data and log the outcome
        this.setBlock(_.result(stats, 'block', this.stats.block), history, function(err, block) {
            console.log("Block stats after setBlock:", block);
        });

        // Set the basic stats and log the outcome
        this.setBasicStats(stats, function(err, basicStats) {
            console.log("Basic stats after setBasicStats:", basicStats);
        });

        // Set pending transactions and log the outcome
        this.setPending(_.result(stats, 'pending', this.stats.pending), function(err, pendingStats) {
            console.log("Pending stats after setPending:", pendingStats);
        });

        // After updating everything, log the final stats
        console.log("Updated stats after processing:", this.getStats());

        callback(null, this.getStats());
    } else {
        console.log("Stats object is undefined.");
        callback('Stats undefined', null);
    }
};

Node.prototype.setBlock = function(block, history, callback)
{
	if( !_.isUndefined(block) && !_.isUndefined(block.number) )
	{
		if ( !_.isEqual(history, this.history) || !_.isEqual(block, this.stats.block) )
		{
			if(block.number !== this.stats.block.number || block.hash !== this.stats.block.hash)
			{
				this.stats.block = block;
			}

			this.setHistory(history);

			callback(null, this.getBlockStats());
		}
		else
		{
			callback(null, null);
		}
	}
	else
	{
		callback('Block undefined', null);
	}
}

Node.prototype.setHistory = function(history)
{
	if( _.isEqual(history, this.history) )
	{
		return false;
	}

	if( !_.isArray(history) )
	{
		this.history = _.fill( new Array(MAX_HISTORY), -1 );
		this.stats.propagationAvg = 0;

		return true;
	}

	this.history = history;

	var positives = _.filter(history, function(p) {
		return p >= 0;
	});

	this.stats.propagationAvg = ( positives.length > 0 ? Math.round( _.sum(positives) / positives.length ) : 0 );
	positives = null;

	return true;
}

Node.prototype.setPending = function(stats, callback)
{
	if( !_.isUndefined(stats) && !_.isUndefined(stats.pending))
	{
		if(!_.isEqual(stats.pending, this.stats.pending))
		{
			this.stats.pending = stats.pending;

			callback(null, {
				id: this.id,
				pending: this.stats.pending
			});
		}
		else
		{
			callback(null, null);
		}
	}
	else
	{
		callback('Stats undefined', null);
	}
}

Node.prototype.setBasicStats = function(stats, callback)
{
	if( !_.isUndefined(stats) )
	{
		if( !_.isEqual(stats, {
			active: this.stats.active,
			peers: this.stats.peers,
			gasPrice: this.stats.gasPrice,
			uptime: this.stats.uptime,
			syncing: this.stats.syncing,
			pending: this.stats.pending,
			blockTransactionCount: this.stats.blockTransactionCount,
			blockUncleCount: this.stats.blockUncleCount,
			block: this.stats.block
		}) )
		{
			this.stats.active = stats.active;
			this.stats.syncing = (!_.isUndefined(stats.syncing) ? stats.syncing : false);
			this.stats.peers = stats.peers;
			this.stats.gasPrice = stats.gasPrice;
			this.stats.uptime = stats.uptime;
			this.stats.pending = stats.pending;
			this.stats.blockTransactionCount = stats.blockTransactionCount;
			this.stats.blockUncleCount = stats.blockUncleCount;
			this.stats.block = stats.block;

			callback(null, this.getBasicStats());
		}
		else
		{
			callback(null, null);
		}
	}
	else
	{
		callback('Stats undefined', null);
	}
}

Node.prototype.setLatency = function(latency, callback)
{
	if( !_.isUndefined(latency) )
	{
		if( !_.isEqual(latency, this.stats.latency) )
		{
			this.stats.latency = latency;

			callback(null, {
				id: this.id,
				latency: latency
			});
		}
		else
		{
			callback(null, null);
		}
	}
	else
	{
		callback('Latency undefined', null);
	}
}

Node.prototype.getStats = function()
{
	return {
		id: this.id,
		stats: {
			active: this.stats.active,
			syncing: this.stats.syncing,
			peers: this.stats.peers,
			gasPrice: this.stats.gasPrice,
			block: this.stats.block,
			propagationAvg: this.stats.propagationAvg,
			uptime: this.stats.uptime,
			pending: this.stats.pending,
			latency: this.stats.latency,
			block: this.stats.block,
			blockTransactionCount: this.stats.blockTransactionCount,
			blockUncleCount: this.stats.blockUncleCount
		},
		history: this.history
	};
}

Node.prototype.getBlockStats = function()
{
	return {
		id: this.id,
		block: this.stats.block,
		propagationAvg: this.stats.propagationAvg,
		history: this.history
	};
}

Node.prototype.getBasicStats = function()
{
	return {
		id: this.id,
		stats: {
			active: this.stats.active,
			syncing: this.stats.syncing,
			peers: this.stats.peers,
			gasPrice: this.stats.gasPrice,
			block: this.stats.block,
			propagationAvg: this.stats.propagationAvg,
			uptime: this.stats.uptime,
			pending: this.stats.pending,
			latency: this.stats.latency,
			block: this.stats.block,
			blockTransactionCount: this.stats.blockTransactionCount,
			blockUncleCount: this.stats.blockUncleCount
		}
	};
}

Node.prototype.setState = function(active)
{
	var now = _.now();

	if(this.uptime.started !== null)
	{
		if(this.uptime.lastStatus === active)
		{
			this.uptime[(active ? 'up' : 'down')] += now - this.uptime.lastUpdate;
		}
		else
		{
			this.uptime[(active ? 'down' : 'up')] += now - this.uptime.lastUpdate;
		}
	}
	else
	{
		this.uptime.started = now;
	}

	this.stats.active = active;
	this.uptime.lastStatus = active;
	this.uptime.lastUpdate = now;

	this.stats.uptime = this.calculateUptime();

	now = undefined;
}

Node.prototype.calculateUptime = function()
{
	if(this.uptime.lastUpdate === this.uptime.started)
	{
		return 100;
	}

	return Math.round( this.uptime.up / (this.uptime.lastUpdate - this.uptime.started) * 100);
}

Node.prototype.getBlockNumber = function()
{
	return this.stats.block.number;
}

Node.prototype.canUpdate = function()
{
	if (this.trusted) {
		return true;
	}
	// return (this.info.canUpdateHistory && this.trusted) || false;
	return (this.info.canUpdateHistory || (this.stats.syncing === false && this.stats.peers > 0)) || false;
}

Node.prototype.isInactiveAndOld = function()
{
	if( this.uptime.lastStatus === false && this.uptime.lastUpdate !== null && (_.now() - this.uptime.lastUpdate) > MAX_INACTIVE_TIME )
	{
		return true;
	}

	return false;
}

module.exports = Node;
