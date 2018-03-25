'use strict';

window.onload = function() {
  const electron = require('electron');
  const {ipcRenderer} = electron;
  const fs = require('fs');
  const path = require('path');
  const form = document.querySelector('form');

  const YEAR = 2000;

  /************* SETUP ****************/
  form.addEventListener('submit', submitForm);
  var logFile = null;

  // disable the submit button initially
  enableButton("submit", false);
  
  $('select').material_select();

  // setup listener for custom event to re-initialize on change
  $('select').on('contentChanged', function() {
    $(this).material_select();
  });

  // set default menus 
  var year = new Date().getFullYear();
  setYearSelectionMenu(year);
  
  // for week numbers
  setWeekSelectionMenu(year);
  
  // set toggle disable on file buttons
  document.getElementById("images").addEventListener('change', function(e) {
    getInput(e);
  });
  document.getElementById("folder").addEventListener('change', function(e) {
    getInput(e);
  });
  document.getElementById("yearSelect").addEventListener('change', function(e) {
    if ($("#weekSelect").val() == "") {
      if ($(this).val() == "") {
        clearMenu($("#weekSelect"));
        setWeekSelectionMenu(new Date().getFullYear());
      } else {
        console.log("year: " + $(this).val() + ", week: " + $("#weekSelect").val());
      }
    } 
  });

  // toggle csv granulation between month & week
  document.getElementById("permo").addEventListener('click', (e)=> {toggleBox(e, 'perwk');});
  document.getElementById("permo").addEventListener('change', (e)=> {toggleBox(e, 'perwk');});

  document.getElementById("perwk").addEventListener('click', (e)=> {toggleBox(e, 'permo');});
  document.getElementById("perwk").addEventListener('change', (e)=> {toggleBox(e, 'permo');});

  /************ FUNCTIONS *****************/

  /* toggle checking between two checkboxes */
  function toggleBox(e, otherId) {
    if (e.target.checked && document.activeElement == e.target) {
      e.stopPropagation();
      document.getElementById(otherId).checked = "";
    }
  }

  /* year selection menu */
  function setYearSelectionMenu(year) {
    var $yearSelect = $("#yearSelect");
    for (let i = year; i >= YEAR; i--) {
      var $newOpt = $("<option>").attr("value",i).text(i);
      $yearSelect.append($newOpt);
    }
    // fire custom event anytime you've updated select
    $("#yearSelect").trigger('contentChanged');
  }

  /* year selection menu */
  function setWeekSelectionMenu(year) {
    var $weekSelect = $("#weekSelect");
    var menu = createWeekMenu(year);
    for (let i = 0; i < menu.length; i++) {
      var $newOpt = $("<option>").attr("value",i).text((i + 1) + " (" + menu[i] + ")");
      $weekSelect.append($newOpt);
    }
    // fire custom event anytime you've updated select
    $("#weekSelect").trigger('contentChanged');
  }

  /* add a default option to the menu */
  function clearMenu($menuId) {
    $menuId.empty();
    var $newOpt = $("<option>").attr("value","");
    $newOpt.attr("disabled","disabled").attr("selected", "selected").text("");
    $menuId.append($newOpt);
  }

  /* Enable button */
  function enableButton(btnId, enableOn) {
    var btn = document.getElementById(btnId);
    if (enableOn) {
      btn.classList.remove('disabled');
      //btn.setAttribute('disabled', '');

    } else {
      btn.classList.add('disabled');
      //btn.setAttribute('disabled', true);
    }
  }

  /* Get input: called when a file picker button is clicked */
  function getInput(e) {
    //e.stopPropagation();  // don't stop propagation since materialize is updating wrapped field

    // display the path to the folder or image(s) just selected
    var f = e.target.files;
    var path = getPath(f);
    document.getElementById("data").innerHTML = "Input|Output folder >> " + path;

    // store which file picker button to use when building the CSV
    document.getElementById("fid").innerHTML = e.target.id;

    // blank out the filelist and value from the other file picker button
    // and text display field
    var other = (e.target.id === "images") ? "folder" : "images";
    other = document.getElementById(other);
    other.files = null;
    other.value = "";
    other.parentElement.parentElement.querySelector(".file-path").value = "";

    // also erase output file messages from previous runs
    document.getElementById("csvFile").innerHTML = "";
    document.getElementById("logFile").innerHTML = "";

    console.log(f);

    // enable Create CSV button
    if (f.length > 0) {
      enableButton("submit", true);
    }
  }  // end getInput()


  /* Function to call when form is submitted */
  function submitForm(e) {
    e.preventDefault();

    // check that file or folder selected
    var fid = document.getElementById("fid").innerHTML;
    if (!fid) {
      // error
      document.getElementById("data").innerHTML = "<span class='red-text'>No file or folder chosen.</span>";
      return;
    }

    // returns a file list
    var files = document.getElementById(fid).files;
    if (!files || files.length == 0) return;  // should never happen

    var path = getPath(files);

    // make sure you can read from and write to the selected path
    // TODO: figure out how to make this work in production mode
    fs.access(path, fs.constants.W_OK | fs.constants.R_OK, (err) => {
      if (err) {
        console.error("Cannot read or write to current directory");
        return;
      } else {

        // create a log file
        logFile = fs.createWriteStream(path + "/log.txt", "utf8");
        if (logFile) logFile.write(Date.now() + " => Selected file/folder: " + path + "\n");
        
        buildCSV(fid, path, files);
      }
    });

  } // end submitForm()

  /* takes a filelist and returns the path */
  function getPath(files) {

    // find the path of the first file in the filelist
    var path = files[0].path;

    // use type to determine whether path is folder or file name.
    // (type will be empty if a folder; otherwise, it holds file type)
    var type = files[0].type;
    if (type) {
      // strip file name out of path
      path = path.substring(0, path.lastIndexOf('/'));
    }

    return path;
  }

  /* build the CSV file */
  function buildCSV(fid, path, files) {

    // get values from checkboxes
    var keys = buildDataTagsArray();

    // build list of images
    var images = [];
    if (fid == "folder") {
      images = getFiles(path);
    } else {
      for (let i = 0; i < files.length; i++) {
        images.push(files[i].path);
      }
    }
    
    if (images && images.length > 0) {
      processImages(path, images, keys);
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
    if (form.querySelector("#month").checked) {
      data.push("Month");
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

    return {"data": data, "tags": tags};
  } // end buildDataTagsArray()


  /* Read the .jpg files from the folder selected by user */
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
  function processImages(path, files, keys) {
    

    // get filters
    var filters = getFilters();

    try {

      var fileStream = fs.createWriteStream(path + "/output.csv", "utf8");
      
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

        // filter and manipulate the data to get it into the 
        // needed format
        var csvData = processRawData(rawData, keys, filters);

        // output data to file
        if (csvData) {
          fileStream.write(csvData);
        }

        // TODO: break up csv files
        

        // enable Get CSV button
        //enableButton("output", true);
        document.getElementById("csvFile").innerHTML = "<strong>CSV File</strong>: " + path + "/output.csv";

      }  
    } catch (exc) {
      if (logFile) logFile.write(Date.now() + " => Error occurred while creating or writing to file stream: " + exc.message + "\n");

    
    } finally {
      // display message to show file is complete
      // along with link/button to get file
      fileStream.end();
      logFile.end();

      // enable Log File buttons
      //enableButton("error", true);
      document.getElementById("logFile").innerHTML = "<strong>Log File</strong>: "  + path + "/log.txt";
    }
  }  // end processImages()

  /*
    get CSV filters
  */
  function getFilters() {
    var inputValues = document.querySelectorAll(".data_filter input[type='text']");

    // convert months to numbers
    var abbr = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var months = [false,false,false,false,false,false,false,false,false,false,false,false];
    var mon = inputValues[1].value;
    if (mon) {
      mon = mon.trim().split(", ");
      for (let i = 0; i < mon.length; i++) {
        months[abbr.indexOf(mon[i])] = true;
      }
    }
    
    // years
    var years = inputValues[0].value;
    if (years) {
      years = years.trim().split(", ");
    }
    
    // remove week dates
    var weeks = inputValues[2].value;
    if (weeks) {
      weeks = weeks.replace(/ \([\w][\w][\w]-[\d][\d]?-[\d][\d]\)/g, '');
      weeks = weeks.split(', ');
    }
    
    // species
    var species = inputValues[3].value;
    if (species) {
      species = species.trim().toUpperCase().split(", ");
    }
    
    var filters = {};
    filters['year'] = years;
    filters['month'] = months;
    filters['week'] = weeks;
    filters['species'] = species;
    
    var csv = {};
    csv['yr'] = document.getElementById("peryr").checked;
    csv['mo'] = document.getElementById("permo").checked;
    csv['wk'] = document.getElementById("perwk").checked;
    csv['sp'] = document.getElementById("perspec").checked;
    filters['csv'] = csv;

    console.log(filters);

    return filters;
  }


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
    var allExif = parser.parse(); // returns all exif data in photo

    // pull just our tag values into results object
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
  function processRawData(rawData, keys, filters) {
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
    console.log(date);

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
          data += ",";
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
          data += ",";
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
          data += ",";
        }
      } else if (key === "Week") {   // convert time to week
        if (date) {
          var week = date.getWeek();  // custom method added to Date prototype
          //data += "Week:";

          // if a week filter exists and photo week doesn't match, return immediately
          if (filters['week'] && !filters['week'].includes(week)) {  
            return;
          }
          data += week + ",";
        } else {
          console.error("Extracted data is missing DateTimeOriginal");
          data += ",";
        }
      } else if (key === "Month") {  // convert time to month
        if (date) {
          var month = date.getMonth();
          //data += "Year:";

          // if a month filter exists and photo month doesn't match, return immediately
          if (filters['month'] && !filters['month']) {  
            return;
          }
          data += month + ",";
        } else {
          console.error("Extracted data is missing DateTimeOriginal");
          data += ",";
        }
      } else if (key === "Year") {  // convert time to year
        if (date) {
          var year = date.getFullYear();
          //data += "Year:";

          // if a year filter exists and photo year doesn't match, return immediately
          if (filters['year'] && !filters['year'].includes(year)) {  
            return;
          }
          data += year + ",";
        } else {
          console.error("Extracted data is missing DateTimeOriginal");
          data += ",";
        }
      } else {  // extract rawData[key] as a string
        if (rawData.hasOwnProperty(key)) {
          //data += key + ":";

          // if a week filter exists and photo week doesn't match, return immediately
          if (key == "Copyright" && filters['species']) {  
            var species = rawData["Copyright"].toUpperCase();
            if (!filters['species'].includes(species)) return;
          }
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
      //degrees = degrees.toFixed(2);
    }
    return degrees;
  }


  // This script is released to the public domain and may be used, modified and
  // distributed without restrictions. Attribution not necessary but appreciated.
  // Source: https://weeknumber.net/how-to/javascript

  // Returns the ISO week of the date.
  Date.prototype.getWeek = function() {
    var date = new Date(this.getTime());
    date.setHours(0, 0, 0, 0);
    // Thursday in current week decides the year.
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    // January 4 is always in week 1.
    var week1 = new Date(date.getFullYear(), 0, 4);
    // Adjust to Thursday in week 1 and count number of weeks from date to week1.
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000
                          - 3 + (week1.getDay() + 6) % 7) / 7);
  }

  // Returns the four-digit year corresponding to the ISO week of the date.
  Date.prototype.getWeekYear = function() {
    var date = new Date(this.getTime());
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    return date.getFullYear();
  }

  /* ISO Week Date always starts on Monday and first week always
     includes Thursday */
  function createWeekMenu(year) {

    var menu = [];
    let start = new Date(year, 0, 1);

    // find number of days Jan. 1 is away from Thursday
    // since Thursday is always in week 1
    let day = 4 - start.getDay();
    if (day < 0) day += 7;

    // find first Thursday on or after Jan. 1, then
    // back up three days to Monday (start of week 1)
    start.setDate(start.getDate() + day - 3);
    var dt = start.toDateString().split(" ");
    day = dt[1] + "-" + start.getDate() + "-" 
          + start.getFullYear().toString().substring(2);
    menu.push(day);

    // increase each week and record start of week date
    var end = new Date(year, 11, 31);
    while (start < end) {
      start.setTime(start.getTime() + (7 * 24 * 60 * 60 * 1000));  
      dt = start.toDateString().split(" ");
      day = dt[1] + "-" + start.getDate() + "-" 
          + start.getFullYear().toString().substring(2);
      menu.push(day);
    }

    return menu;
  }

};