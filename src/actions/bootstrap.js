import get from 'lodash/get';
import isError from 'lodash/isError';
import Gists from '../services/Gists';
import Repos from '../services/Repos';
import Bugsnag from '../util/Bugsnag';
import {getInitialUserState, signIn} from '../clients/firebaseAuth';
import {
  createProject,
  setCurrentProjectToRepo,
  initializeCurrentProjectFromGist,
} from './projects';
import {userAuthenticated} from './user';
import {notificationTriggered} from './ui';
import {loadAllProjects} from '.';

export default function bootstrap({gist: gistId, user: owner, repo: name}) {
  return async (dispatch) => {
    async function firstLogIn(userCredential) {
      await dispatch(userAuthenticated(userCredential));
      await dispatch(loadAllProjects());
    }

    async function userStateResolved() {
      const userCredential = await getInitialUserState();
      if (userCredential) {
        await firstLogIn(userCredential);
      }
      return userCredential;
    }

    const isGist = Boolean(gistId);
    const isRepo = owner && name;

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
    } else if (isRepo) {
      try {
        let userCredential = await userStateResolved();
        if (!userCredential) {
          userCredential = await signInToRetrieveRepo();
          await firstLogIn(userCredential);
        }
        const contents = await retrieveRepo(owner, name, userCredential.user);
        dispatch(setCurrentProjectToRepo({owner, name}, contents));
      } catch (error) {
        dispatch(notificationTriggered(error));
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

function retrieveRepo(owner, name, user) {
  return Repos.
    fetchMaster(owner, name, user).
    catch((error) => {
      const statusCode = get(error, 'response.status');
      if (statusCode === 404) {
        return Promise.reject('repo-import-not-found');
      }
      Bugsnag.notify(error);
      return Promise.reject('repo-import-error');
    });
}

function signInToRetrieveRepo() {
  return signIn().
    catch((error) => {
      switch (error.code) {
        case 'auth/popup-closed-by-user':
          return Promise.reject('user-cancelled-repo-auth');
        case 'auth/network-request-failed':
          return Promise.reject('auth-network-error');
        default:
          if (isError(error)) {
            Bugsnag.notifyException(error);
          } else {
            Bugsnag.notify(error);
          }
          return Promise.reject('auth-error');
      }
    });
}
