import isEmpty from 'lodash/isEmpty';
import trim from 'lodash/trim';
import performWithRetries from '../util/performWithRetries';
import {createPopcodeJson} from '../util/projectUtils';
import gitHub from './gitHub';

export function EmptyGistError(message) {
  this.name = 'EmptyGistError';
  this.message = message;
  this.stack = new Error().stack;
}
EmptyGistError.prototype = Object.create(Error.prototype);

export function createGistFromProject(project) {
  const files = {};
  if (trim(project.sources.html)) {
    files['index.html'] = {
      content: project.sources.html,
      language: 'HTML',
    };
  }
  if (trim(project.sources.css)) {
    files['styles.css'] = {
      content: project.sources.css,
      language: 'CSS',
    };
  }
  if (trim(project.sources.javascript)) {
    files['script.js'] = {
      content: project.sources.javascript,
      language: 'JavaScript',
    };
  }
  if (project.enabledLibraries.length) {
    files['popcode.json'] = {
      content: createPopcodeJson(project),
      language: 'JSON',
    };
  }

  return {
    description: 'Exported from Popcode.',
    'public': true,
    files,
  };
}

function canUpdateGist(user) {
  return Boolean(gitHub.getGithubToken(user));
}

async function updateGistWithImportUrl(github, gistData) {
  const gist = github.getGist(gistData.id);
  const uri = document.createElement('a');
  uri.setAttribute('href', '/');
  uri.search = `gist=${gistData.id}`;

  const description = `${gistData.description} Click to import: ${uri.href}`;
  const response = await performWithRetries(() => gist.update({description}));
  return response.data;
}

const Gists = {
  async createFromProject(project, user) {
    const github = gitHub.clientForUser(user);

    const gist = createGistFromProject(project);
    if (isEmpty(gist.files)) {
      return Promise.reject(new EmptyGistError());
    }

    const response =
      await performWithRetries(() => github.getGist().create(gist));

    const gistData = response.data;
    if (canUpdateGist(user)) {
      return updateGistWithImportUrl(github, gistData);
    }
    return gistData;
  },

  async loadFromId(gistId, user) {
    const github = gitHub.clientForUser(user);
    const gist = github.getGist(gistId);
    const response = await performWithRetries(() => gist.read(), {retries: 3});
    return response.data;
  },
};

export default Gists;
