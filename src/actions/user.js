import {createAction} from 'redux-actions';
import identity from 'lodash/identity';
import {loadAllProjects, saveCurrentProject} from '.';

export const userAuthenticated = createAction(
  'USER_AUTHENTICATED',
  identity,
);

const resetWorkspace = createAction('RESET_WORKSPACE', identity);

const userLoggedOut = createAction('USER_LOGGED_OUT');

export function logIn(user, credential) {
  return async (dispatch, getState) => {
    await Promise.all([
      dispatch(userAuthenticated({user, credential})),
      saveCurrentProject(getState()),
    ]);
    await dispatch(loadAllProjects());
  };
}

export function logOut() {
  return (dispatch, getState) => {
    const currentProjectKey =
      getState().getIn(['currentProject', 'projectKey']);
    dispatch(resetWorkspace({currentProjectKey}));
    dispatch(userLoggedOut());
  };
}
