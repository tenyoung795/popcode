import GitHub from 'github-api';
import get from 'lodash/get';

const anonymousGithub = new GitHub({});

export default {
  clientForUser(user) {
    const token = this.getGithubToken(user);
    if (token) {
      return new GitHub({auth: 'oauth', token});
    }
    return this.anonymous();
  },

  getGithubToken(user) {
    return get(user, ['accessTokens', 'github.com']);
  },

  anonymous() {
    return anonymousGithub;
  },
};
