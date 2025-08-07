// // rando.js
autowatch = 1;

inlets = 5;

var MODES = {
    SHALLOW: 0,
    DEEP: 1
};

var mode = MODES.SHALLOW; // Default mode
var excludedMacros = [];
var randomDeviance = 100;
var randomRange = 100;

// EVENT LISTENERS
function msg_int(val) {
    if (this.inlet === 1) {
        if (val === 0) {
            mode = MODES.SHALLOW;
        } else if (val === 1) {
            mode = MODES.DEEP;
        }
    } else if (this.inlet === 2) {
        randomDeviance = parseInt(val);
    } else if (this.inlet === 3) {
        randomRange = parseInt(val);
    }
}

function anything(messagename) {
    var text = messagename;
    if (this.inlet === 4) {
        if (text && text.length > 0) {
            excludedMacros = text.split(",").map(function(item) {
                return item.trim();
            });
        } else {
            excludedMacros = [];
        }
    }
}

// UTILITY FUNCTIONS
function str_includes(str, search) {
    return str.indexOf(search) > -1;
}

function array_includes(arr, item) {
    return arr.indexOf(item) > -1;
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

function getNewMacroValueWithRandomness(current, randomDeviance, randomRange) {

    var amt = parseFloat(randomDeviance / 100); // convert to 0.0–1.0
    var rng = parseFloat((randomRange / 100) * 127);  // convert to 127 scale
    var curr = parseFloat(current);

    post(rng, curr, curr + rng, curr - rng);

    // Random target within ±rng of current value
    var minRand = clamp(curr - rng, 0.0, 127.0);
    var maxRand = clamp(curr + rng, 0.0, 127.0);

    var randomVal = Math.random();

    var randomTarget = randomVal * (maxRand - minRand) + minRand;

    // Interpolate based on amount
    var newVal = curr + (randomTarget - curr) * amt;
    newVal = clamp(newVal, 0.0, 127.0);
    post("New Value: " + newVal + "\n");
    newVal = Math.round(newVal);

    return newVal;
}

function randomizeDeviceParameters(nextDevice) {
    try {
        // nextDevice.call("randomize_macros"); // Trigger randomization
        // post("Randomized macros for track " + trackNumber + ", device " + deviceIndex + "\n");
        var paramIds = nextDevice.get("parameters");

        for (var i = 1; i < paramIds.length; i += 2) {
            var param = new LiveAPI("id " + paramIds[i]); // ← use ID, not path string
            var name = param.get("name").toString() || "";
            var original_name = param.get("original_name").toString() || "";
            // Check if the parameter is valid
            if (param != null && param.id != 0 && str_includes(original_name, "Macro") && !array_includes(excludedMacros, name)) {
                try {
                    var currentValue = param.get("value");
                    var newValue = getNewMacroValueWithRandomness(currentValue, randomDeviance, randomRange);
                    param.set("value", newValue);
                } catch (e) {
                    post("Error on param", i, ":", e.message, "\n");
                }
            } else {
                post("Invalid parameter at index " + i + "\n");
            }
        }
    } catch (e) {
        post("Cannot randomize parameter button on device: " + e + "\n");
    }
}

function getTrackNumber() {
    // Start from "this_device", which is the Max device itself
    var device = new LiveAPI("this_device");
    var path = device.path; 

    // Step upward until we hit the track level
    var parent = new LiveAPI(path);
    while (parent.path.indexOf("tracks") === -1 && parent.path !== "") {
      parent = new LiveAPI(parent.path.split(" ").slice(0, -1).join(" "));
    }

    if (parent.path.indexOf("tracks") !== -1) {
        return parseInt(parent.path.split("tracks ")[1].charAt(0)); // Extract track number
    } else {
        post("Track not found.\n");
        return null;
    }
}

function isRealDevice(device) {
    // Check if the LiveAPI object points to something real
  if (device && device.id !== 0 && device.path !== "") {
      return true;
  } else {
      return false;
  }
}

function getNextDevice(trackNumber, deviceIndex) {
    // Construct the LiveAPI path for the next device
    var path = "live_set tracks " + trackNumber + " devices " + deviceIndex;
    var device = new LiveAPI(path);

    if (isRealDevice(device)) {
        return device;
    } else {
      post("No device at: " + path + "\n");
      return null;
    }
}

function walkDevices(path) {
    var container = new LiveAPI(path);
    var deviceCount = container.getcount("devices");

    for (var i = 0; i < deviceCount; i++) {
        var devicePath = path + " devices " + i;
        var device = new LiveAPI(devicePath);

        if (isRealDevice(device)) {
            randomizeDeviceParameters(device);
        }

        // If the device has chains, dive deeper
        var hasChains = device.getcount("chains");
        if (hasChains > 0) {
            for (var c = 0; c < hasChains; c++) {
                var chainPath = devicePath + " chains " + c;
                walkDevices(chainPath); // Recursively walk devices in this chain
            }
        }
    }
}

// Test by calling with a bang
function bang() {
    var trackNumber = getTrackNumber();
    if (mode === MODES.SHALLOW) {
        if (trackNumber !== null) {
            var deviceIndex = 0; // go through all devices on the track
            var nextDevice = getNextDevice(trackNumber, deviceIndex);
            
            while (nextDevice !== null) {
                randomizeDeviceParameters(nextDevice);
                deviceIndex++;
                nextDevice = getNextDevice(trackNumber, deviceIndex);
            }
        } else {
            post("Invalid track path.\n");
        }
    } else {
        walkDevices("live_set tracks " + trackNumber);
    }
}