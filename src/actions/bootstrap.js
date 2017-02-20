import get from 'lodash/get';
import Gists from '../services/Gists';
import Bugsnag from '../util/Bugsnag';
import {getInitialUserState} from '../clients/firebaseAuth';
import {
  createProject,
  initializeCurrentProjectFromGist,
} from './projects';
import {userAuthenticated} from './user';
import {notificationTriggered} from './ui';
import {loadAllProjects} from '.';

export default function bootstrap({gist: gistId, user, repo}) {
  return async (dispatch) => {
    async function userStateResolved() {
      const userCredential = await getInitialUserState();
      if (userCredential) {
        dispatch(userAuthenticated(userCredential));
        dispatch(loadAllProjects());
      }
      return userCredential;
    }

    const isGist = Boolean(gistId);
    const isRepo = user && repo;

    async function promisedGist() {
      try {
        return await retrieveGist(gistId);
      } catch (error) {
        dispatch(notificationTriggered(error, 'error', {gistId}));
        return null;
      }
    }

    if (isGist && isRepo) {
      dispatch(notificationTriggered('url-query-error'));
    } else if (isGist) {
      const [gist] = await Promise.all([promisedGist(), userStateResolved()]);
      if (gist) {
        dispatch(initializeCurrentProjectFromGist(gist));
      } else {
        dispatch(createProject());
      }
      return;
    }
    await userStateResolved();
    dispatch(createProject());
  };
}

function retrieveGist(gistId) {
  return Gists.
    loadFromId(gistId, {authenticated: false}).
    catch((error) => {
      if (get(error, 'response.status') === 404) {
        return Promise.reject('gist-import-not-found');
      }
      Bugsnag.notify(error);
      return Promise.reject('gist-import-error');
    });
}
