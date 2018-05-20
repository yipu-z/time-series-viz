//GLOBAL VARIABLES
var rawInitialTimestamp; // First Timestamp as it comes from db
var processedInitialTimestamp; //First Timestamp converted to desired format
var gsrData; //From db
var gsrFirstMarker = []; //Skin conductance data from the first marker onward
var timestamps = []; //Calculated from first timestamp, at 4hz (.25 seconds)
var timestampsFirstMarker = []; //Timestamps from the first marker onward
var markers; //From db
var processedMarkers = []; //Markers converted to closes value on the timestamp array
var chartRefresh;
var currentVideoTime; //Number of the current time the video is set to.
var videoName; // String to validate the subject is the same in video/GSR data.
var subjectId; // String to validate the subject is the same in video/GSR data.

// Initialize Firebase
var config = {
  apiKey: "AIzaSyAsp1Xn7i2xwWIoyR8RjMHDez5q0_MDPtw",
  authDomain: "gizmo-database.firebaseapp.com",
  databaseURL: "https://gizmo-database.firebaseio.com",
  projectId: "gizmo-database",
  storageBucket: "gizmo-database.appspot.com",
  messagingSenderId: "1099422978824"
};
firebase.initializeApp(config);

// =============================================================================
// Read data from DB
// =============================================================================
function initializeSelection(){
  var firebaseSubjectRef = firebase.database().ref();
  firebaseSubjectRef.on('value', function(datasnapshot) {
    for (var i = 0; i < Object.keys(datasnapshot.val()).length; i++) {
      //Add each entry to subject selection
      var subjectId = Object.keys(datasnapshot.val())[i];
      $('#subjectSelect').append('<option value="' + subjectId + '">' + subjectId + '</option>');
    }
  });
}

// =============================================================================
// Login (GMAIL)
// =============================================================================
function login() {
  function newLoginHappened(user) {
    if (user) {
      //User is signed in, show name
      $('#user').html('Logged in as ' + user.displayName);
      initializeSelection();
    } else {
      //Request credentials
      var provider = new firebase.auth.GoogleAuthProvider();
      firebase.auth().signInWithRedirect(provider);
    }
  }
  firebase.auth().onAuthStateChanged(newLoginHappened);
}

window.onload = function(){
  login();
};

//Logout
function logOut() {
  firebase.auth().signOut().then(function() {
    window.alert('Signed Out');
  }, function(error) {
    window.alert('Sign Out Error', error);
  });
}


//Initialize bootstrap modal
$('#subjectModal').on('shown.bs.modal', function() {
  $('#myInput').trigger('focus');
});

// =============================================================================
//Upon subject selection, store the selected user data on a variable
// =============================================================================

$('#select').click(function(event) {
  var selectedSubject = $('#subjectSelect').val();
  subjectId = selectedSubject;
  validateSubject();
  //Display subject number
  $('#subjectId').fadeIn();
  $('#subjectId>strong').html(selectedSubject);
  //Query subject info from db
  var selectedSubjectRef = firebase.database().ref().child(selectedSubject);
  selectedSubjectRef.on('value', function(datasnapshot) {
    var selectedSubjectData = datasnapshot.val();
    //Get initial timestamp
    rawInitialTimestamp = selectedSubjectData.initialTimestamp;
    //Multiply by 1000 (millisecond resolution, and truncate remaining decimals)
    processedInitialTimestamp = Math.trunc(rawInitialTimestamp * 1000);
    //Get and strore gsrData
    gsrData = selectedSubjectData.gsrData;
    //Get and store markers
    markers = selectedSubjectData.userMarkers;

    //Store array of timestamps based on initial timestamp.
    var currentTimestamp;
    for (var i = 0; i < gsrData.length; i++) {
      if (i == 0) {
        currentTimestamp = processedInitialTimestamp;
      } else {
        currentTimestamp = currentTimestamp + 250;
      }
      timestamps.push(currentTimestamp);
    }
    //Determine closest value on timestamp array, for each marker. Create an array of these values
    //reset processed markers in case other selections were previously made
    processedMarkers = [];
    for (var k = 0; k < markers.length; k++) {
      var closest = getClosestNum(markers[k], timestamps);
      processedMarkers.push(closest);
    }

    //Show number of markers to corroborate
    $('#subjectMarkers>strong').html('Number of markers: ' + processedMarkers.length);
    //Show 'add marker' button
    $('#addMarker').fadeIn();
    //Remove all gsr values before first marker. Remove timestamps before first marker.
    for (var l = 0; l < gsrData.length; l++) {
      if (timestamps[l] >= processedMarkers[0]) {
        gsrFirstMarker.push(gsrData[l]);
        timestampsFirstMarker.push(timestamps[l]);
      }
    }
  });
});

// =============================================================================
// Write to database
// =============================================================================
function saveData(){
  var subjectData={gsrData: gsrData, initialTimestamp: rawInitialTimestamp, userMarkers: processedMarkers};
  if (confirm('Are you sure you want to save the data?')) {
    firebase.database().ref('edits/'+subjectId).set(subjectData);
    location.reload();
  }else {
    console.log('canceled');
  }

}

// =============================================================================
//  Video Navigation
// =============================================================================
var vid = document.getElementById("subjectVideo");
vid.onplay = function() {
  //Display subject video tag
  $('#videoId').fadeIn();
  $('#videoId>strong').html($("#videoSource").attr("src"));
  var vidTimestamp = getClosestNum((vid.currentTime * 1000) + timestampsFirstMarker[0], timestampsFirstMarker);
  currentVideoTime = vidTimestamp;
  startGsrChart(gsrFirstMarker, timestampsFirstMarker, markers, currentVideoTime);
};

vid.onpause = function() {
  clearInterval(chartRefresh);
  var vidTimestamp = getClosestNum((vid.currentTime * 1000) + timestampsFirstMarker[0], timestampsFirstMarker);
  currentVideoTime = vidTimestamp;
};

vid.ontimeupdate = function() {
  var vidTimestamp = getClosestNum((vid.currentTime * 1000) + timestampsFirstMarker[0], timestampsFirstMarker);
  currentVideoTime = vidTimestamp;
  $('#currentTimestamp>strong').html(currentVideoTime);
};

// =============================================================================
// Video selection
// =============================================================================

function initializeVideo() {
  var URL = window.URL || window.webkitURL;
  var file = $('#videoInputFile')[0].files[0];
  videoName = file.name.split('.')[0];
  var fileURL = URL.createObjectURL(file);
  $('#subjectVideo').attr('src', fileURL);
  validateSubject();
}

// =============================================================================
// Chart implementation
// =============================================================================
function startGsrChart(gsrData, timestamps, markers, currentVideoTime) {
  //Initialize empty dataset
  var dps = [];

  //Instantiate chart
  var chart = new CanvasJS.Chart("chartContainer", {
    title: {
      text: "GSR Data"
    },
    axisY: {
      includeZero: true,
      interval: 1,
      title: "µS",
      yValueFormatString: "###.########"
    },
    axisX: {
      title: "Time",
      valueFormatString: "hh:mm:ss"
    },
    data: [{
      xValueFormatString: "hh:mm:ss",
      type: "line",
      dataPoints: dps
    }]
  });

  var gsrdisplay = gsrData; //Copy of gsrarray to be manipulated
  var yVal = 0; //First value for y axis
  var updateInterval = 250; //Refresh frequency of the chart in milliseconds
  var dataLength = 30; // number of dataPoints visible at any point
  var currentTimestamp = currentVideoTime;
  var markerSizeVal;
  var markerColorVal;
  var click;

  var initializeChart = function(datapointsSize) {
    for (var i = 0; i < datapointsSize; i++) {
      //Initialize object to store each data point.
      var datapoint = {};
      datapoint.y = null;
      datapoint.x = new Date((currentVideoTime - (datapointsSize * 250))+(i*250));
      //Add default values to datapoints
      datapoint.cursor = 'pointer';
      datapoint.originalTimestamp = currentTimestamp - 250;
      dps.push(datapoint);
      if (i==datapointsSize-1) {
        chart.render();
      }
    }
  };

  var updateChart = function() {
    //Initialize object to store each data point.
    var datapoint = {};

    //If the timestamp of the current element is present in markers, highlight it.
    if (processedMarkers.includes(currentTimestamp)) {
      //Highlight for markers
      datapoint.markerSize = 15;
      datapoint.markerColor = "red";
      //When clicking, show option to remove marker
      datapoint.click = function(e) {
        if (confirm('Do you want to remove this marker?')) {
          processedMarkers = removeMarker(processedMarkers, e.dataPoint.originalTimestamp);
          //Update current number of markers
          $('#subjectMarkers>strong').html('Number of markers: ' + processedMarkers.length);
        } else {
          console.log('canceled');
        }
      };
    }
    datapoint.y = gsrdisplay[0];
    currentTimestamp = currentTimestamp + 250;
    datapoint.x = new Date(currentTimestamp);
    gsrdisplay.shift();
    //Add default values to datapoints
    datapoint.cursor = 'pointer';
    datapoint.originalTimestamp = currentTimestamp - 250;
    dps.push(datapoint);

    dps.shift();

    chart.render();
  };

  initializeChart(dataLength);
  chartRefresh = setInterval(function() {
    updateChart();
  }, updateInterval);

}

// =============================================================================
//  Function to add markers
// =============================================================================
function addMarker() {
  processedMarkers.push(currentVideoTime);
  //Update current number of markers
  $('#subjectMarkers>strong').html('Number of markers: ' + processedMarkers.length);
}

// =============================================================================
//  Function to remove markers
// =============================================================================
function removeMarker(markerArray) {
  var what, a = arguments,
    L = a.length,
    ax;
  while (L > 1 && markerArray.length) {
    what = a[--L];
    while ((ax = markerArray.indexOf(what)) !== -1) {
      markerArray.splice(ax, 1);
    }
  }
  return markerArray;
}

// =============================================================================
//  Function to find closest number on array
// =============================================================================
function getClosestNum(num, ar) {
  var i = 0,
    closest, closestDiff, currentDiff;
  if (ar.length) {
    closest = ar[0];
    for (i; i < ar.length; i++) {
      closestDiff = Math.abs(num - closest);
      currentDiff = Math.abs(num - ar[i]);
      if (currentDiff < closestDiff) {
        closest = ar[i];
      }
      closestDiff = null;
      currentDiff = null;
    }
    //returns first element that is closest to number
    return closest;
  }
  //no length
  return false;
}

// =============================================================================
//  Validate video selection matches GSR selection
// =============================================================================

function validateSubject() {
  if (videoName == subjectId) {
    $('#subjectVideo').attr('controls', 'controls');
    $('#validation').fadeOut();
  } else {
    $('#subjectVideo').removeAttr('controls');
    $('#validation').fadeIn();
  }
}
