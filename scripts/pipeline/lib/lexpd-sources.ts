// Pinned source files for the public-domain lexicon stages (stages/lexicons-pd.ts).
//
// BDB: Bible Aquifer's CC0 edition of Brown-Driver-Briggs, Hebrew and Aramaic parts, at fixed commits.
// Each entry is [path in the repository, sha256 of the cached copy]. A changed upstream file fails the
// download step (context.download) instead of being converted silently.

export interface PinnedRepo {
  /** Cache folder under .cache/sources/. */
  sub: string;
  repo: string;
  commit: string;
  files: [path: string, sha256: string][];
}

export const BDB_HEBREW: PinnedRepo = {
  sub: 'bdb/aquifer-hebrew',
  repo: 'BibleAquifer/BDBHebrewLexicon',
  commit: '09fbdf34f82c2e020f772cb578a2bcc0383f5a32',
  files: [
    ['README.md', 'ff956350dff30109138d63c26cfb95d0289a044ed0ae86de41a94c6ea18083d6'],
    ['eng/metadata.json', '38236149fca188fc285ae027eeb333d96c54a031bf5bb133aff5cfa88b4a9806'],
    ['eng/json/000.content.json', 'a58bd1e2e5d001ce8d34dd0773ffb4f02d8d700f3ab07bd60a9afd539e4181dd'],
    ['eng/json/001.content.json', 'b94a8b20c976650a7525a9ac3bdd9ff9a53ae7970c7015725496646a442ce0ee'],
    ['eng/json/002.content.json', '4ef7c7898b6cba749867c92899dd481a2d69d1aa3baec381cb21a578235a7611'],
    ['eng/json/003.content.json', 'a25fa120eac47ef61130bc8718446cfec5c0a7e8a1d8475b5d5fae4372f13036'],
    ['eng/json/004.content.json', 'ed1e69970e55dbafa76f731ec95e1509c2f1acb477670c6268ef67f18d115266'],
    ['eng/json/005.content.json', '0de67ed190dd7c161627c8eb0821ae41bd03610343a410224cb8afd05eab3944'],
    ['eng/json/006.content.json', 'f9c7a4c1f0efe29428d08602babc544e4d6335f5d9d32f7d2eb78838b2105e91'],
    ['eng/json/007.content.json', '08cf84e0b11defa1c1b6f07438e67888d0bea5ae2cb790c0716ae7b6e1690518'],
    ['eng/json/008.content.json', '6437144a18fbf877e7258f96e108f6d73d20d4038f87ba6d1e1032c836b2b314'],
    ['eng/json/009.content.json', 'debf3a97ae534370b62b90ac86f91a7cd5b36e73f881184b16c636b29b3bace6'],
    ['eng/json/010.content.json', 'f01367fd45e4327ae5da8b4a42f9284de2a527ab6fd4b9939f00c8a36385fa76'],
    ['eng/json/011.content.json', '99babcbaeb6c682b426fff905ccbacca6cae6f427b27d8d6451afd848efe214f'],
    ['eng/json/012.content.json', '14ca875eb0fe214c31dfd3e55cd63ccc332ad9717fc3c8fffa007c9b5f392d96'],
    ['eng/json/013.content.json', 'a52f99b40d1b8c5664b4f74607854f2bcef82300c28c7fc90f7f7c4b364f1b1a'],
    ['eng/json/014.content.json', '8b73c8f35af5a98d8465ff3cb435a90d7da5aa947f108ba9c360ca09d203480d'],
    ['eng/json/015.content.json', 'c8c2594d1219e79d1071d56c4c83b148c3abe9d08a662ab059e8e3141fd5bf0b'],
    ['eng/json/016.content.json', '7306d52cb468bef8bf3e65c2e4e16237759806aad69101191588f7a28dd98e85'],
    ['eng/json/017.content.json', '857715c3aea99799685deca8bce368f9bd2f95b3df54d855dc6bdb7dbfa09279'],
    ['eng/json/018.content.json', '3bece8d18f10ef0fdcad7de1032ac78fff32beb5f7f75999d885c02f93f2e4b7'],
    ['eng/json/019.content.json', 'fe061bd9b42311c8694d23ca81d09499483e95d6e10efade7dda29dd3f902690'],
    ['eng/json/020.content.json', '13b8333dd3cca46090b5371dda90a1925ceafe66bdaca0339e917ed3822401b9'],
    ['eng/json/021.content.json', 'd5838fbb37bac3e3932065ffb31e54191b04ee1c3dfd21b1d597b6db1cc40171'],
    ['eng/json/022.content.json', '1e82e8e12c3174ce1e4549129d666710e8000888a44f29a1020e83eb1e79a440'],
  ],
};

export const BDB_ARAMAIC: PinnedRepo = {
  sub: 'bdb/aquifer-aramaic',
  repo: 'BibleAquifer/BDBAramaicLexicon',
  commit: '7ccfaf4e5cd62763d5481e58d6a2dcfea8527c99',
  files: [
    ['README.md', '54e0238e8dc64d3a444d1faf7cdadfe6c2901fea9e34fb2f0c957ab98291571d'],
    ['eng/metadata.json', '1f453aae4f44df6f7ce69d239baa443a9191c48685eda0145e337c8d6126da9f'],
    ['eng/json/000.content.json', 'eb17056624de1d642bd7b7fa3c573505e392cab904992c78b97fbd8b31af347e'],
    ['eng/json/001.content.json', 'f22f0dcd53354287aff773f9164b88a53548cb754da2f91aadd591f56b79a2d4'],
    ['eng/json/002.content.json', '2dddb6bdabb5261d744ce5f77018559e566a97cd9d75bbe21a3b10379f8731e7'],
    ['eng/json/003.content.json', 'e520e5ab015a3608b7a4756e06855b085c8fef27962eacf00f45b345bce05563'],
    ['eng/json/004.content.json', 'b9204f7f7acbcac0b5314066e0f1837d622a058bd2bc7e56c3a7f194cc739776'],
    ['eng/json/005.content.json', 'f78ae845bc376e25dda0c6c50b0ab8f949316ae8f68dbafedff7d3496c6dbbb7'],
    ['eng/json/006.content.json', '676373b149847ed6c32080379f730fc6593e2514705ee15ef6de2aa212c3689f'],
    ['eng/json/007.content.json', '8682f149e60c8377ea1ef78a8c3aeeebe46833fff589683ec74e40fcef283bf6'],
    ['eng/json/008.content.json', '1123de6af90e6c8755c99942dc3ff81b1912c6d0f850e71349dab083c0e0cfaa'],
    ['eng/json/009.content.json', '73d194e40b4af5c7e45e74962305d07c972f6dd751aec10bff5b9e166f011fd6'],
    ['eng/json/010.content.json', '935bd38b05617c9affb9901351bcf7543b5411c8c2c08a4c50b1ce7c0e6f2018'],
    ['eng/json/011.content.json', '97a7a8d6e38f5cc340350b19a048e0aeb4d5b7db5f6b29160094df8588c32518'],
    ['eng/json/012.content.json', 'ff044fd50d5000e34af9267f717bd947e0c8d9527c0f98b9c413d805f82cd94b'],
    ['eng/json/013.content.json', 'f8e65cf4ed40ccd7ddedb45e24d0dede5aabd71c43f878436a45c2834974cde2'],
    ['eng/json/014.content.json', 'afa1d1b3f6b8471adbdc9be7e00d13f312a738d5f4e3c5b5b17c7548a7fc26c8'],
    ['eng/json/015.content.json', 'da62a1222c0abbcef86ca7782e518521288fca9ea72bc1ec5716539c850d7180'],
    ['eng/json/016.content.json', 'a0b75259414996015332c46686f14a575715f50b398267f9d931daf830c6cb8b'],
    ['eng/json/017.content.json', 'a82bf644b0ab2aad4eff9e0d5b05b2a369a223672dea4f3e4a207d962b740eb9'],
    ['eng/json/018.content.json', 'd46662b43f92dbee1cdc28fe47cad9215d12194b23ec5803d60da58a833d181b'],
    ['eng/json/019.content.json', 'd3be34be7820b0898ce12a22b257bb58063c5893fab3107ea0cdacf02c77b2c2'],
    ['eng/json/020.content.json', '98a454b97fffff7f7e7da43206bf17e40b284255cd49c14cbd55a84a7665f81a'],
    ['eng/json/021.content.json', '5253bb2a4593ad73b564f067eeaca5462dfb2d139e0f60369fc3901774920a8c'],
    ['eng/json/022.content.json', 'e0ecf0dc6dd5730ace167e6f44eb3506d4b323332133115f5fb6d27205be2acb'],
  ],
};

export function rawUrl(repo: PinnedRepo, path: string): string {
  return `https://raw.githubusercontent.com/${repo.repo}/${repo.commit}/${path}`;
}

/** Cache file name: the last path segment ("eng/json/000.content.json" → "000.content.json"). */
export function cacheName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
