import React from 'react';
const Parse = require('parse/react-native.js');
import AsyncStorage from '@react-native-async-storage/async-storage';

export default class ParseInit extends React.Component {

    initParseSDKForPlantel(plantel) {
        console.log("RUNNING ParseInit initParseSDKForPlantel: " + plantel);
        var parseAppId = "";
        var parseAppKey = "";
        var parseServerURL = "";
    
        switch (plantel) {
          case 'skola':
              parseAppId = "skolaAppId";
              parseAppKey = "HaOAxK44dLooin7sL1lv6SsZyMQ2c3OWqPvaF31B";
              parseServerURL = "https://skola-server.herokuapp.com/parse";
            break;
          case 'littleFeet':
                parseAppId = "skolalittlefeetAppId";
                parseAppKey = "";
                parseServerURL = "https://skola-littlefeet-server.herokuapp.com/parse";
              break;
          case 'bbColon':
                parseAppId = "skolabbcolonAppId";
                parseAppKey = "";
                parseServerURL = "https://skola-bbcolon-server.herokuapp.com/parse";
              break;
          case 'bbCapu':
                parseAppId = "skolabbcapulAppId";
                parseAppKey = "";
                parseServerURL = "https://skola-bbcapul-server.herokuapp.com/parse";
              break;
          case 'bbMetepec':
                parseAppId = "skolabbmetepecAppId";
                parseAppKey = "";
                parseServerURL = "https://skola-bbmetepec-server.herokuapp.com/parse";
              break;
          case 'bbPreschool':
                parseAppId = "skolabbpreschoolAppId";
                parseAppKey = "";
                parseServerURL = "https://bbpreschool.herokuapp.com/parse";
              break;
          case 'mtToluca':
                parseAppId = "skolamomstotstolucaAppId";
                parseAppKey = "";
                parseServerURL = "https://skola-momstotstoluca-server.herokuapp.com/parse";
              break;
          case 'mtMetepec':
                parseAppId = "skolamomstotsmetepecAppId";
                parseAppKey = "";
                parseServerURL = "https://skola-momstotsmetepec-server.herokuapp.com/parse";
              break;

          default:
            console.log("Plantel not recognized");
            break;
        } // switch
    
        // Init Parse SDK
        Parse.initialize(parseAppId, parseAppKey);
        Parse.serverURL = parseServerURL;
        Parse.setAsyncStorage(AsyncStorage);
    }
}