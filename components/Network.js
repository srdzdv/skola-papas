import * as Network from 'expo-network';

class NetworkState {
    async checkNetworkState() {
        let networkState = await Network.getNetworkStateAsync();
        return networkState.isConnected
    }

    validateEmail = (text) => {
        let reg = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
        if (reg.test(text) === false) {
          return false;
        }
        else {
          return true;
        }
      }
}

const networkState = new NetworkState();
export default networkState;