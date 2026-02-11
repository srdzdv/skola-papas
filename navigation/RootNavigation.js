import * as React from 'react';

export const navigationRef = React.createRef();

export function navigate(name, params) {
  navigationRef.current?.navigate(name, params);
}

export function getCurrentRoute() {
  if (navigationRef.current) {
    const route = navigationRef.current.getCurrentRoute();
    return route?.name;
  }
  return null;
}