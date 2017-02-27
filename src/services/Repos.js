import merge from 'lodash/merge';
import performWithRetries from '../util/performWithRetries';
import gitHub from './gitHub';

export default {
  async fetchMaster(owner, name, user) {
    const client = gitHub.clientForUser(user);
    const repo = client.getRepo(owner, name);
    const {data} = await performWithRetries(
      () => repo.getContents('master', ''), {retries: 3},
    );

    async function promisedFile(key, sha) {
      const {data: blob} = await performWithRetries(
        () => repo.getBlob(sha), {retries: 3},
      );
      return {[key]: blob};
    }

    function *promisedFiles() {
      for (const {name: filename, sha} of data) {
        let key = null;
        switch (filename) {
          case 'index.html':
            key = 'html';
            break;
          case 'styles.css':
            key = 'css';
            break;
          case 'script.js':
            key = 'javascript';
            break;
          case 'popcode.json':
            key = 'popcode';
            break;
        }
        if (key) {
          yield promisedFile(key, sha);
        }
      }
    }
    return merge({}, ...await Promise.all(promisedFiles()));
  },
};
