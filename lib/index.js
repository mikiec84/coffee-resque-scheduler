(function() {
  var EventEmitter, Helpers, ResqueScheduler;
  var __hasProp = Object.prototype.hasOwnProperty, __extends = function(child, parent) {
    for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; }
    function ctor() { this.constructor = child; }
    ctor.prototype = parent.prototype;
    child.prototype = new ctor;
    child.__super__ = parent.prototype;
    return child;
  };
  EventEmitter = require('events').EventEmitter;
  Helpers = {
    rTimestamp: function(timestamp) {
      var rTimestamp;
      if (typeof timestamp === 'object' && typeof (timestamp.getTime())) {
        rTimestamp = timestamp.getTime() / 1000;
      } else if (typeof timestamp === 'number') {
        rTimestamp = timestamp / 1000;
      } else {
        throw "Invalid timestamp provide. Should be either a Date object or a number.";
      }
      return rTimestamp;
    }
  };
  ResqueScheduler = (function() {
    __extends(ResqueScheduler, EventEmitter);
    function ResqueScheduler(Resque) {
      this.resque = Resque;
      this.redis = this.resque.redis;
      this.running = false;
      this.ready = false;
      this.interval = null;
    }
    ResqueScheduler.prototype.enqueueAt = function(queue, timestamp, command, args) {
      var item;
      item = JSON.stringify({
        "class": command,
        queue: queue,
        args: args || []
      });
      return this.delayedPush(timestamp, item);
    };
    ResqueScheduler.prototype.enqueueIn = function(queue, numberOfSecondsFromNow, command, args) {
      var newTime;
      newTime = new Date() + (numberOfSecondsFromNow * 1000);
      return this.enqueueAt(queue, newTime, command, args);
    };
    ResqueScheduler.prototype.delayedPush = function(timestamp, item) {
      var rTimestamp;
      rTimestamp = Helpers.rTimestamp(timestamp);
      this.redis.rpush(this.key("delayed:" + rTimestamp), item);
      return this.redis.zadd(this.key('delayed_queue_schedule'), rTimestamp, rTimestamp);
    };
    ResqueScheduler.prototype.start = function() {
      if (this.ready && !this.running) {
        return this.interval = setInterval(poll, 5000);
      }
    };
    ResqueScheduler.prototype.end = function(cb) {
      this.running = false;
      clearInterval(this.interval);
      return this.interval = null;
    };
    ResqueScheduler.prototype.poll = function() {
      if (!this.running) {
        return;
      }
      this.nextDelayedTimestamp(function(err, timestamp) {
        if (timestamp != null) {
          return this.enqueueDelayedItemsForTimestamp(timestamp, function(err) {
            if (err == null) {
              return this.nextDelayedTimestamp(arguments.callee);
            }
          });
        }
      });
    };
    ResqueScheduler.prototype.nextDelayedTimestamp = function(atTime, callback) {
      var time;
      time = Helpers.rTimestamp(atTime ? atTime : new Date());
      return this.redis.zrangebyscore('delayed_queue_schedule', '-inf', time, 'limit', 0, 1, function(err, items) {
        if (err || !(items != null)) {
          return callback(err);
        } else {
          return callback(false, items[0]);
        }
      });
    };
    ResqueScheduler.prototype.enqueueDelayedItemsForTimestamp = function(timestamp, callback) {
      return this.nextItemForTimestamp(timestamp, function(err, job) {
        if (!(err != null) && (job != null)) {
          this.transfer(job);
          return this.nextItemForTimestamp(timestamp, arguments.callee);
        } else {
          return callback(err);
        }
      });
    };
    ResqueScheduler.prototype.nextItemForTimestamp = function(timestamp, callback) {
      return this.redis.lpop("delayed:" + timestamp, function(err, job) {
        cleanupTimestamp("delayed:" + timestamp, timestamp);
        if (err) {
          return callback(err);
        } else {
          return callback(false, JSON.parse(job));
        }
      });
    };
    ResqueScheduler.prototype.transfer = function(job) {
      console.log("Queuing job: " + (JSON.stringify(job)));
      return this.redis.enqueue(job.queue, job["class"], job.args);
    };
    ResqueScheduler.prototype.cleanupTimestamp = function(timestamp) {
      return redis.llen(("delayed:" + timestamp)(function(err, len) {
        if (length === 0) {
          this.redis.del("delayed:" + timestamp);
          return this.redis.zrem('delayed_queue_schedule', timestamp);
        }
      }));
    };
    return ResqueScheduler;
  })();
  exports.schedulerUsing = function(Resque) {
    return new exports.ResqueScheduler(Resque || {});
  };
  exports.ResqueScheduler = ResqueScheduler;
}).call(this);