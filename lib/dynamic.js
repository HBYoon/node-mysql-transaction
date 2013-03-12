module.exports = dynamicConnectionFactory;

function dynamicConnectionFactory (queueControl) {
	var number = queueControl.config.dynamicConnection;
	
	var baseConnectionNumber = queueControl.config.connectionNumber;
	var baseLine = baseConnectionNumber * 32
	var loopTime = queueControl.config.dynamicConnectionLoopTime;
	var on = false;
	var dynamicCount = 0;
	var lastQueueLength = 0;
	
	function increaseDynamicConnection(){
		if (dynamicCount >= number) {
			return
		}
		dynamicCount += 1;
		try {
			queueControl.increaseConnection();
		} catch(e) {
			console.error(e);
		}
		queueControl.usableConnnection().nextQuery();
	};
	
	function decreaseDynamicConnection(){
		if (0 >= dynamicCount) {
			return
		}
		dynamicCount -= 1;
		try {
			queueControl.decreaseConnection();
		} catch(e) {
			console.error(e);
		}
	};
	
	function loopOn () {
		if (on) {
			return;
		}
		on = true;
		(function dynamicLoop(){
			var length = queueControl.queueLength();
			var delta = length - lastQueueLength;
			
			if (delta > 0 || length > baseLine) {
				increaseDynamicConnection();
			} else {
				decreaseDynamicConnection();
			}
			
			if (length === 0 && delta === 0) {
				return loopOff();
			}
			
			lastQueueLength = length;
			if (on) {
				return setTimeout(dynamicLoop,loopTime);
			}
		})();
	};
	
	function loopOff () {
		on = false;
		(function innerLoop () {
			if (!(dynamicCount > 0)) {
				return;
			}
			decreaseDynamicConnection();
			if (!on) {
				return setTimeout(innerLoop,loopTime);
			}
		})();
	};
	
	queueControl.dynamicConnection = {
		loopOn: loopOn,
		loopOff: loopOff,
		isOn: function(){
			return on;
		},
	};
	
	if (number) {
		queueControl.dynamicConnection.loopOn();
	}
	
	return queueControl;
};
