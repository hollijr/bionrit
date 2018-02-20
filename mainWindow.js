'use strict';

window.onload = function() {
  const electron = require('electron');
  const {ipcRenderer} = electron;
  const fs = require('fs');
  const path = require('path');
  const form = document.querySelector('form');
  form.addEventListener('submit', submitForm);
  var logFile = null;

  // set toggle disable on file buttons
  document.getElementById("file").addEventListener('change', function(e) {
    getInput(e);
  });
  document.getElementById("folder").addEventListener('change', function(e) {
    getInput(e);
  });

  function getInput(e) {
    e.stopPropagation();
    // get folder of images or images
    var f = e.target.files;
    document.getElementById("data").innerHTML = "Extract from: " + f[0].path;
    document.getElementById("fid").innerHTML = e.target.id;
    var other = (e.target.id === "file") ? "folder" : "file";
    document.getElementById(other).files = null;
    document.getElementById(other).value = "";
    console.log(f);
  }  // end getFolder()

  /* 
    Function to call when form is submitted
  */
  function submitForm(e) {
    e.preventDefault();

    // create output file
    fs.access(".", fs.constants.W_OK | fs.constants.R_OK, (err) => {
      if (err) {
        console.error("Cannot read or write to current directory");
        return;
      } else {
        logFile = fs.createWriteStream("log.txt", "utf8");
        buildCSV();
      }
    });

  } // end submitForm()

  function buildCSV() {
    // get values from checkboxes
    var keys = buildDataTagsArray();

    // get files
    var folder = getFolder();
    var files = getFiles(folder);

    if (files.length > 0) {
      processImages(files, keys);
    }   
  } // end buildCSV()


  /*
    Build an array of data elements that user selected to
    include in the CSV file and an array of EXIF tags 
    needed to provide that data.
  */
  function buildDataTagsArray() {
    var data = [];
    var tags = [];

    // gps data
    if (form.querySelector("#longlat").checked) {
      data.push("GPSLatLong");
      //tags.push("GPSVersionID");
      tags.push("GPSLatitudeRef");
      tags.push("GPSLatitude");
      tags.push("GPSLongitudeRef");
      tags.push("GPSLongitude");
    }
    if (form.querySelector("#altitude").checked) {
      data.push("GPSAltitude");
      tags.push("GPSAltitudeRef");
      tags.push("GPSAltitude");
    }

    // data is probably always needed but we'll give them
    // an option to omit it
    var datestamp = false;
    if (form.querySelector("#week").checked) {
      data.push("Week");
      datestamp = true;
    }
    if (form.querySelector("#year").checked) {
      data.push("Year");
      datestamp = true;
    }
    if (datestamp) {
      tags.push("DateTimeOriginal");
    }

    // 
    if (form.querySelector("#keywords").checked) {
      tags.push("Copyright");
      data.push("Copyright");
    }
    if (form.querySelector("#temp").checked) {
   
    }
    return {"data": data, "tags": tags};
  } // end buildDataTagsArray()

  /*
    Get the path to the folder selected in the form
  */
  function getFolder() {
    // get folder of images or images
    var folder = form.querySelector("input[type=file]").files;
    if (logFile) logFile.write(Date.now() + " => Opening " + folder[0].path + "\n");
    return folder[0].path;

  }  // end getFolder()


  /*
    Read the .jpg files from the folder selected by user
  */
  function getFiles(folder, fileList) {
    fileList = fileList || [];

    var files = fs.readdirSync(folder);
    //console.log(files);

    // recursively gets images in folder and its subfolders
    for (var i in files) {
      if (!files.hasOwnProperty(i)) continue;
      var name = folder + "/" + files[i];
      if (fs.statSync(name).isDirectory()) { 
        getFiles(name, fileList);
      } else if (name.toUpperCase().endsWith(".JPG") || name.toUpperCase().endsWith(".JPEG")) {
        fileList.push(name);
        //console.log(name);
      }
    }
    return fileList;
  } // end getFiles()

  
  /*
    Extract the EXIF data from all image files and
    convert it to comma-separated values, which are
    stored in output file
  */
  function processImages(files, keys) {
    try {
      var fileStream = fs.createWriteStream("output.csv", "utf8");
      
      // go through each file and extract
      // the key:value pairs for the needed tags
      for (let i = 0; i < files.length; i++) {
        var rawData = parseImage(files[i], keys.tags);
        if (logFile) {
          logFile.write(Date.now() + " => Raw Data from " + files[i] + ":\n");
          for (var key in rawData) {
            logFile.write("\t" + key + ": " + rawData[key] + "\n");
          }
        }

        // manipulate the data to get it into the 
        // needed format
        var csvData = processRawData(rawData, keys);

        // output data to file
        fileStream.write(csvData);

      }  
    } catch (exc) {
      if (logFile) logFile.write(Date.now() + " => Error occurred while creating or writing to file stream: " + exc.message + "\n");
    } finally {
      // display message to show file is complete
      // along with link/button to get file
      fileStream.end();
      logFile.end();
    }
  }  // end processImages()


  /* 
     use exif-parser to extract and return the tags:values
     as an object
  */
  function parseImage(filename, tags, logFile) {

    // open image file
    //var buffer = fs.readFileSync(__dirname + "/" + filename);
    var buffer = fs.readFileSync(filename);

    // parse using exif-parser
    const parser = require('exif-parser').create(buffer);
    parser.enableSimpleValues(false);
    var allExif = parser.parse();

    // pull desired values into results object
    var subsetExif = {};
    
    for (let i = 0; i < tags.length; i++) {
      var tag = tags[i];
      if (allExif.tags.hasOwnProperty(tag)) {
        subsetExif[tag] = allExif.tags[tag];
      } else {
        if (logFile) logFile.write("\t" + tag + " not found\n");
      }
    }
    
    return subsetExif;
  } // end parseImage()


  /* 
    format the raw exif data into comma-separated
    values to store in file.  Order of data is
    Longitude
    Latitude
    Altitude
    Week
    Year
    Species
  */
  function processRawData(rawData, keys) {
    var data = "";

    // fix format of date
    var date = null;
    if (rawData.hasOwnProperty("DateTimeOriginal")) {
      date = rawData["DateTimeOriginal"].toString();
      try {
        date = date.trim().split(" ");
        var parts = date[0].split(":");
        date = parts[1] + " " + parts[2] + " " + parts[0] + " " + date[1];
        date = new Date(date);
        if (logFile) logFile.write(Date.now() + " => Photo date: " + date + "\n");
      } catch (e) {
        if (logFile) logFile.write(Date.now() + " => Date format was unexpected: " + rawData.hasOwnProperty("DateTimeOriginal") + "\n");
      }
    }

    for (let i = 0; i < keys.data.length; i++) {
      var key = keys.data[i], decDeg;

      // convert GPS data formats
      // current format: degrees minutes seconds
      // decimal degrees = degrees + (minutes/60) + (seconds/3600)
      if ( key === "GPSLatLong") {
        if (rawData.hasOwnProperty("GPSLatitude")) {
          // convert to decimal degrees
          decDeg = convertToDegrees(rawData["GPSLatitude"]);
          if (rawData.hasOwnProperty("GPSLatitudeRef") && 
              rawData["GPSLatitudeRef"].toString().substring(0,1).toUpperCase() !== "N") {
            decDeg = -decDeg;
          }
          //data += "Lat:";
          data += decDeg + ",";
        } else {
          console.error("Extracted data is missing GPSLatitude");
        }
        if (rawData.hasOwnProperty("GPSLongitude")) {
          decDeg = convertToDegrees(rawData["GPSLongitude"]);
          if (rawData.hasOwnProperty("GPSLongitudeRef") && 
              rawData["GPSLongitudeRef"].toString().substring(0,1).toUpperCase() !== "E") {
            decDeg = -decDeg;
          }
          //data += "Long:";
          data += decDeg + ",";
        } else {
          console.error("Extracted data is missing GPSLongitude");
        }
      } else if ( key === "GPSAltitude") {
        if (rawData.hasOwnProperty("GPSAltitude")) {
          var alt;
          if (rawData.hasOwnProperty("GPSAltitude")) {
            alt = rawData["GPSAltitude"];
            alt = alt[0][0] / alt[0][1];
            if (rawData.hasOwnProperty("GPSAltitudeRef") && rawData["GPSAltitudeRef"] == 1) {
              alt = -alt;
            }
          }
          //data += "Alt:";
          data += alt + ",";
        } else {
          console.error("Extracted data is missing GPSAltitude");
        }
      } else if (key === "Week") {   // convert time to week
        if (date) {
          var week = getWeekNum(date);
          //data += "Week:";
          data += week + ",";
        } else {
          console.error("Extracted data is missing DateTimeOriginal");
        }
      } else if (key === "Year") {  // convert time to year
        if (date) {
          var year = date.getFullYear();
          //data += "Year:";
          data += year + ",";
        } else {
          console.error("Extracted data is missing DateTimeOriginal");
        }
      } else {  // extract rawData[key] as a string
        if (rawData.hasOwnProperty(key)) {
          //data += key + ":";
          data += '"' + rawData[key] + '",';
        } else {
          console.error("Extracted data is missing " + key);
        }
      }
    }

    // remove trailing comma
    if (data.length > 0 && data.charAt(data.length-1) === ",") {
      data = data.substring(0, data.length-1);
    }

    return data + "\n";
  }  // processRawData()


  function convertToDegrees(gps) {
    var degrees = null;
    if (gps.length === 3) {
      degrees = (gps[0][0] / gps[0][1]) + ((gps[1][0] / gps[1][1]) / 60) + ((gps[2][0] / gps[2][1]) / 3600);
      degrees = degrees.toFixed(2);
    }
    return degrees;
  }


  function getWeekNum(date) {

    var year = date.getFullYear();
    
    // convert to week uses scheme where 1/1 is week 1 and
    // following Sunday starts week 2
    var start = new Date(year, 0, 1);

    // time of second week start (in case first week is partial)
    var sunday = 8 - start.getDay();
    var second = new Date(year, 0, sunday);

    var week = 1;
    var diff = date.valueOf() - second.valueOf();
    if (diff >= 0) {

      // difference in weeks between photo's date and start of second week
      diff = Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));  
      week += diff;
    }
    return week;
  }

};