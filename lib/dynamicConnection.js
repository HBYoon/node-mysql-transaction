module.exports = dynamicConnection;

function dynamicConnection(queueControl) {
  var dCon = Object.create(dynamicObj);
  
  dCon.dConNum         = queueControl.config.dynamicConnection;
  dCon.loopTime        = queueControl.config.dynamicConnectionLoopTime;
  dCon.on              = false;
  dCon.dynamicCount    = 0;
  dCon.lastQueueLength = 0;
  
  dCon.tool                    = {};
  dCon.tool.queueLength        = queueControl.queueLength.bind(queueControl);
  dCon.tool.usableConnnection  = queueControl.usableConnnection.bind(queueControl);
  dCon.tool.increaseConnection = queueControl.increaseConnection.bind(queueControl);
  dCon.tool.decreaseConnection = queueControl.decreaseConnection.bind(queueControl);
  
  return dCon;
};

var dynamicObj = {
  increaseDynamicConnection: function(){
    if (this.dynamicCount >= this.dConNum) {
      return;
    }
    this.dynamicCount += 1;
    try {
      this.tool.increaseConnection();
    } catch(e) {
      console.error(e);
    }
    this.tool.usableConnnection().nextQuery();
  },
    
  decreaseDynamicConnection: function decreaseDynamicConnection(){
    if (0 >= this.dynamicCount) {
      return;
    }
    this.dynamicCount -= 1;
    try {
      this.tool.decreaseConnection();
    } catch(e) {
      console.error(e);
    }
  },
    
  loopOn: function(){
    if (this.on) {
      return;
    }
    this.on = true;
    
    var dynamicLoop;
    (dynamicLoop = function(){
      var length = this.tool.queueLength();
      var delta  = length - this.lastQueueLength;
      
      if (length) {
        this.increaseDynamicConnection();
      } else {
        this.decreaseDynamicConnection();
      }
      
      if (length === 0 && delta === 0) {
        return this.loopOff();
      }
      
      this.lastQueueLength = length;
      if (this.on) {
        return setTimeout(dynamicLoop,this.loopTime);
      }
    }.bind(this))();
  },
    
  loopOff: function (){
    this.on = false;
    
    var endLoop;
    (endLoop = function () {
      if (!(this.dynamicCount > 0)) {
        return;
      }
      this.decreaseDynamicConnection();
      if (!this.on) {
        return setTimeout(endLoop,this.loopTime);
      }
    }.bind(this))();
  }
};