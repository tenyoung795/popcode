/* global sinon */

import GitHub from 'github-api';
import gitHub from '../../src/services/gitHub';

export default class MockGitHub {
  constructor(sandbox) {
    this._activeClient = sinon.createStubInstance(GitHub);
    this._activeClient.getGist.returns({
      read: () => new Promise(() => {}),
    });
    sandbox.stub(gitHub, 'anonymous', () => this._activeClient);
  }

  loadGist(data) {
    this._activeClient.getGist.withArgs(data.id).returns({
      read: () => Promise.resolve({data}),
    });
  }

  gistNotFound(gistId) {
    this._activeClient.getGist.withArgs(gistId).returns({
      read: () => Promise.reject({response: {status: 404}}),
    });
  }

  gistError(gistId) {
    this._activeClient.getGist.withArgs(gistId).returns({
      read: () => Promise.reject(new Error()),
    });
  }
}
