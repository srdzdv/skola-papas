import React from 'react';
import { trackEvent } from "@aptabase/react-native";
var Parse = require('parse/react-native');
import { ScrollView, StyleSheet, TouchableOpacity, Text } from 'react-native';

export default class LinksScreen extends React.Component {
  static navigationOptions = {
    title: 'Links',
  };

  userLogOut() {
    Parse.User.logOut().then(() => {
      var currentUser = Parse.User.current();
      this.props.navigation.navigate('Auth');
    });
  }

  render() {
    return (
      <ScrollView style={styles.container}>
        {/* Go ahead and delete ExpoLinksView and replace it with your
           * content, we just wanted to provide you with some helpful links */}
        <TouchableOpacity onPress={this.userLogOut}>
          <Text>Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 15,
    backgroundColor: '#fff',
  },
});
