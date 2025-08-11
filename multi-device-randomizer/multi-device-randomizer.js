autowatch = 1;
inlets = 6;

var excludedMacros = [];
var randomDeviance = 100;
var anchor = false;
var anchorMap = {};
var paramCache = []; // store parameter IDs for faster access
var deviceCount = 0;
var trackNumber = null;
var track = null;

function msg_int(val) {
    if (this.inlet === 2) randomDeviance = parseInt(val);
    else if (this.inlet === 3) {
        anchor = Boolean(val);
        if (!anchor) anchorMap = {};
    }
}

function anything(m) {
    if (this.inlet === 4)
        excludedMacros = m ? m.split(",").map(function(s){return s.trim();}) : [];
}

function callback(args) {
    if (args[0] === "devices") {
        paramCache = [];
    }
}

function getNewMacroValueWithRandomness(current) {
    var amt = randomDeviance / 100;
    var randomVal = Math.random() * 127;
    return Math.round(Math.max(0, Math.min(127, current + (randomVal - current) * amt)));
}

function cacheParameters() {
    paramCache = [];
    if (trackNumber === null) return;
    var basePath = "live_set tracks " + trackNumber;
    walkDevices(basePath);
}

function cacheTrackDevices(path) {
    var devCount = new LiveAPI(path).getcount("devices");
    for (var i = 0; i < devCount; i++) cacheDeviceParams(path + " devices " + i);
}

function cacheDeviceParams(devPath) {
    var dev = new LiveAPI(devPath);
    if (dev && dev.id !== 0) {
        var params = dev.get("parameters");
        for (var i = 1; i < params.length; i += 2) {
            var p = new LiveAPI("id " + params[i]);
            if (p && p.id !== 0) {
                var origName = p.get("original_name").toString();
                if (origName.indexOf("Macro") > -1) {
                    paramCache.push({ id: params[i], name: p.get("name").toString() });
                }
            }
        }
    }
}

function walkDevices(path) {
    cacheTrackDevices(path);
    var devCount = new LiveAPI(path).getcount("devices");
    for (var i = 0; i < devCount; i++) {
        var chains = new LiveAPI(path + " devices " + i).getcount("chains");
        for (var c = 0; c < chains; c++) walkDevices(path + " devices " + i + " chains " + c);
    }
}

function randomizeCachedParams() {
    for (var i = 0; i < paramCache.length; i++) {
        var entry = paramCache[i];
        if (excludedMacros.indexOf(entry.name) === -1) {
            var p = new LiveAPI("id " + entry.id);
            var currVal = anchor && anchorMap[entry.id] !== undefined
                ? anchorMap[entry.id]
                : parseFloat(p.get("value"));
            if (anchor && anchorMap[entry.id] === undefined) anchorMap[entry.id] = currVal;
            p.set("value", getNewMacroValueWithRandomness(currVal));
        }
    }
}

function setTrackNumber() {
    var device = new LiveAPI("this_device");
    var parentPath = device.path;
    while (parentPath && parentPath.indexOf("tracks") === -1) {
        parentPath = parentPath.split(" ").slice(0, -1).join(" ");
    }
    if (!parentPath) trackNumber = null;
    else trackNumber = parseInt(parentPath.split("tracks ")[1].split(" ")[0], 10);
}

function bang() {
    if (trackNumber === null) setTrackNumber();
    post(track);
    if (!track) {
        track = new LiveAPI(callback, "live_set tracks " + trackNumber);
        track.property = "devices";
    }
    if (paramCache.length === 0) cacheParameters();
    randomizeCachedParams();
}