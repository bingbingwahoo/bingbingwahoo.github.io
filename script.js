/* global timsort */

class BitStream {
  constructor(data) {
    this._alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    this._bits = [];
    this._position = 0;
    if (typeof data === 'string' && data.length > 0) {
      for (let i = 0, ii = data.length; i < ii; ++i) {
        const value = this._alphabet.indexOf(data[i]);
        this.writeBits(value >= 0 ? value : 0, 6);
      }
      this._position = this._bits.length - 3;
      const padLength = this.readBits(3);
      this._bits.splice(Math.max(0, this._bits.length - (padLength + 3)));
      this._position = 0;
    }
  }

  get position() {
    return this._position;
  }

  set position(value) {
    this._position = value;
  }

  get length() {
    return this._bits.length;
  }

  toString() {
    let result = '';
    const bits = this._bits;
    const alphabet = this._alphabet;

    // Encode bit length
    const padLength = 5 - (((bits.length % 6) + 2) % 6);
    const positionPre = this._position;
    this._position = bits.length;
    this.writeBits(0, padLength);
    this.writeBits(padLength, 3);

    // Encode data
    for (let i = 0, ii = bits.length; i < ii; i += 6) {
      let byte = 0;
      for (let j = 0, jj = Math.min(ii - i, 6); j < jj; ++j) {
        byte |= bits[i + j] << j;
      }
      result += alphabet[byte];
    }

    // Restore
    bits.splice(bits.length - (padLength + 3));
    this._position = positionPre;

    return result;
  }

  writeBit(value) {
    this._bits.splice(this._position, 0, value);
    ++this._position;
  }

  writeBits(value, count) {
    for (let i = 0; i < count; ++i) {
      this.writeBit((value >> i) & 1);
    }
  }

  readBit() {
    return this._bits[this._position++];
  }

  readBits(count) {
    let result = 0;
    for (let i = 0; i < count; ++i) {
      result |= this.readBit() << i;
    }
    return result;
  }

  static getRequiredBitCount(valueCount) {
    return Math.ceil(Math.log2(Math.max(2, valueCount)));
  }
}

class EventEmitter {
  constructor() {
    this._events = new Map();
  }

  emit(eventName, ...args) {
    const callbacks = this._events.get(eventName);
    if (typeof callbacks === 'undefined') { return false; }
    for (const callback of callbacks) {
      callback(...args);
    }
    return true;
  }

  on(eventName, callback) {
    let callbacks = this._events.get(eventName);
    if (typeof callbacks === 'undefined') {
      callbacks = [];
      this._events.set(eventName, callbacks);
    }
    callbacks.push(callback);
  }

  off(eventName, callback) {
    const callbacks = this._events.get(eventName);
    if (typeof callbacks === 'undefined') { return false; }
    for (let i = 0, ii = callbacks.length; i < ii; ++i) {
      if (callbacks[i] !== callback) { continue; }
      callbacks.splice(i, 1);
      if (callbacks.length === 0) { this._events.delete(eventName); }
      return true;
    }
    return false;
  }
}

class ImageLoader {
  constructor() {
    this._imagePromiseMap = new Map();
    this._previewContainer = null;
  }

  preload() {
    let favicon;
    try {
      favicon = sessionStorage.getItem('data.favicon');
      if (typeof favicon !== 'string') {
        favicon = localStorage.getItem('data.favicon');
      }
    } catch (e) {
      // Ignore
    }
    if (typeof favicon === 'string') {
      this._setFavicon(favicon);
    }
  }

  load(data, main) {
    this._previewContainer = document.querySelector('.intro-preview-container-inner');

    const {favicon, background, icon: mainIcon} = data;

    if (typeof favicon === 'string') {
      const url = main.normalizeUrl(favicon);
      this._setFavicon(url);
      try {
        sessionStorage.setItem('data.favicon', url);
        localStorage.setItem('data.favicon', url);
      } catch (e) {
        // Ignore
      }
    }

    if (typeof mainIcon === 'string') {
      const url = main.normalizeUrl(mainIcon);
      this._loadUniqueImage(url);
      document.querySelector('#main-icon').style.backgroundImage = ImageLoader.createCssUrl(url);
    }

    if (typeof background === 'string') {
      const url = main.normalizeUrl(background);
      this._loadBackground(url);
    }

    for (const {image, icon} of data.options) {
      if (typeof image === 'string') {
        const url = main.normalizeUrl(image);
        this._addPreview(url);
      }
      if (typeof icon === 'string') {
        const url = main.normalizeUrl(icon);
        this._loadUniqueImage(url);
      }
    }
  }

  static createCssUrl(url) {
    return `url("${url.replace(/"/g, '%22')}")`;
  }

  _loadImage(image, url) {
    const promise = new Promise((resolve) => {
      image.addEventListener('load', () => resolve({image, loaded: true}));
      image.addEventListener('error', () => resolve({image, loaded: false}));
      image.src = url;
    });
    this._imagePromiseMap.set(url, promise);
    return promise;
  }

  _loadUniqueImage(url) {
    const promise = this._imagePromiseMap.get(url);
    return typeof promise !== 'undefined' ? promise : this._loadImage(new Image(), url);
  }

  async _addPreview(url) {
    const preview = document.createElement('div');
    preview.className = 'intro-preview-item';
    const image = document.createElement('img');
    image.className = 'intro-preview-image';
    image.hidden = true;
    preview.appendChild(image);
    this._previewContainer.appendChild(preview);
    const {loaded} = await this._loadImage(image, url);
    image.hidden = !loaded;
  }

  async _loadBackground(url) {
    const node = document.querySelector('#background');
    node.style.backgroundImage = ImageLoader.createCssUrl(url);
    const {loaded} = await this._loadUniqueImage(url);
    node.hidden = !loaded;
  }

  _setFavicon(url) {
    document.querySelector('#shortcut-icon').href = url;
  }
}

class Navigation extends EventEmitter {
  constructor() {
    super();
    this._optionCount = 0;
  }

  prepare(optionCount) {
    this._optionCount = optionCount;
    window.addEventListener('popstate', this._onPopState.bind(this));
    this._onPopState();
  }

  setState(sequence, comparisons) {
    this.setUrl(this.getStateUrl(sequence, comparisons));
  }

  getStateUrl(sequence, comparisons) {
    return this._createFragmentUrl(this._getStateString(sequence, comparisons));
  }

  setUrl(url) {
    history.pushState(null, '', url);
    this._onPopState();
  }

  _getStateString(sequence, comparisons) {
    if (sequence === null || comparisons === null) { return ''; }
    const bitStream = new BitStream();
    bitStream.writeBits(0, 2); // Placeholder
    this._writeSequence(bitStream, sequence);
    if (comparisons.length > 0) {
      const bitsPerComparison = (comparisons.indexOf(0) >= 0 ? 2 : 1);
      bitStream.writeBit(bitsPerComparison - 1);
      for (const comparison of comparisons) {
        bitStream.writeBits(comparison < 0 ? 0 : (comparison > 0 ? 1 : 2), bitsPerComparison);
      }
    }
    let result = bitStream.toString();
    const params = this._getHashParams();
    for (const [key, value] of params.entries()) {
      if (value.length === 0) { continue; }
      result += `&${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    }
    return result;
  }

  _getHashParams() {
    const hash = location.hash.replace(/^#!?/, '');
    return new URLSearchParams(hash);
  }

  _onPopState() {
    const params = this._getHashParams();
    let state = null;
    for (const [key, value] of params.entries()) {
      if (value.length === 0) {
        state = key;
        break;
      }
    }
    state = this._getFragmentState(state);
    this.emit('stateChange', {state});
  }

  _createFragmentUrl(fragment) {
    const {protocol, host, pathname, search} = location;
    let url = `${protocol}//${host}${pathname}${search}`;
    if (fragment.length > 0) { url = `${url}#!${fragment}`; }
    return url;
  }

  _getFragmentState(state) {
    if (state === null) { return null; }

    const optionCount = this._optionCount;
    const bitStream = new BitStream(state);
    bitStream.readBits(2); // Placeholder
    const sequence = this._readSequence(bitStream, optionCount);

    if (sequence.length !== optionCount) { return null; }

    const bitsPerComparison = (bitStream.position < bitStream.length && bitStream.readBit() !== 0 ? 2 : 1);
    const comparisons = [];
    for (let i = bitStream.position, ii = bitStream.length; i < ii; i += bitsPerComparison) {
      const comparison = bitStream.readBits(bitsPerComparison);
      comparisons.push(comparison < 2 ? (comparison !== 0 ? 1 : -1) : 0);
    }
    return {sequence, comparisons};
  }

  _writeSequence(bitStream, sequence) {
    const sequenceLength = sequence.length;
    for (let i = 0, ii = sequenceLength - 1; i < ii; ++i) {
      bitStream.writeBits(sequence[i], BitStream.getRequiredBitCount(sequenceLength - i));
    }
  }

  _readSequence(bitStream, sequenceLength) {
    const sequence = [];
    for (let i = 0, ii = sequenceLength - 1; i < ii; ++i) {
      const bitCount = BitStream.getRequiredBitCount(sequenceLength - i);
      if (bitStream.position + bitCount > bitStream.length) {
        // Invalid
        return sequence;
      }
      const value = bitStream.readBits(bitCount);
      sequence.push(value);
    }
    sequence.push(0);
    return sequence;
  }
}

class ComparisonCache {
  constructor() {
    this._map = new Map();
  }

  get(value1, value2) {
    const value = this._map.get(value1);
    return (typeof value === 'undefined' ? value : value.get(value2));
  }

  set(value1, value2, value) {
    let map2 = this._map.get(value1);
    if (typeof map2 === 'undefined') {
      map2 = new Map();
      this._map.set(value1, map2);
    }
    map2.set(value2, value);

    map2 = this._map.get(value2);
    if (typeof map2 === 'undefined') {
      map2 = new Map();
      this._map.set(value2, map2);
    }
    map2.set(value1, -value);
  }
}

class Sorter extends EventEmitter {
  constructor() {
    super();
    this._options = null;
    this._orderedOptions = [];
    this._sequence = [];
    this._comparisons = [];
    this._comparisonsCompleted = [];
    this._currentComparisonResolve = null;
    this._currentComparisonReject = null;
  }

  get active() {
    return this._options !== null;
  }

  get sequence() {
    return this._sequence;
  }

  get comparisons() {
    return this._comparisons;
  }

  get completedComparisonCount() {
    return this._comparisonsCompleted.length;
  }

  get approximateTotalComparisonCount() {
    return timsort.getApproximateComparisonCount(this._sequence.length);
  }

  clear() {
    const reject = this._currentComparisonReject;
    this._options = null;
    this._orderedOptions = [];
    this._sequence = [];
    this._comparisons = [];
    this._comparisonsCompleted = [];
    this._currentComparisonResolve = null;
    this._currentComparisonReject = null;
    if (reject !== null) {
      reject(new Error('Cancelled'));
    }
  }

  setState(options, sequence, comparisons) {
    if (
      this._options === options &&
      this._arraysEqual(this._sequence, sequence, this._sequence.length) &&
      this._arraysEqual(this._comparisons, comparisons, this._comparisons.length)
    ) {
      this._comparisons = comparisons;
      const resolve = this._currentComparisonResolve;
      if (resolve !== null) { resolve(); }
      return;
    }

    this.clear();

    const optionCount = options.length;
    const order = this._createOrder(optionCount, sequence);
    const orderedOptions = [];
    for (const index of order) {
      orderedOptions.push({option: options[index], index, rank: -1});
    }

    this._options = options;
    this._sequence = sequence;
    this._orderedOptions = orderedOptions;
    this._comparisons = comparisons;

    this._sortOptions(orderedOptions);
  }

  createRandomSequence(count) {
    const sequence = [];
    this._createOrder(count, sequence);
    return sequence;
  }

  getCompletedComparisons() {
    return this._comparisonsCompleted.map(({result}) => result);
  }

  _createOrder(count, sequence) {
    const results = [];
    const indices = [];
    for (let i = 0; i < count; ++i) { indices[i] = i; }
    for (let i = 0; i < count; ++i) {
      let index;
      if (i < sequence.length) {
        index = sequence[i];
      } else {
        index = Math.floor(Math.random() * indices.length);
        sequence.push(index);
      }
      index = indices.splice(index, 1)[0];
      results.push(index);
    }
    return results;
  }

  async _sortOptions(orderedOptions) {
    let comparisonIndex = 0;
    const comparisonCache = new ComparisonCache();

    const compare = async (option1, option2) => {
      // Check cache
      const cachedValue = comparisonCache.get(option1, option2);
      if (typeof cachedValue !== 'undefined') { return cachedValue; }

      // Compare
      const flip = this._shouldFlip(option1, option2);
      while (comparisonIndex >= this._comparisons.length) {
        await this._compareOptions(option1, option2, flip); // Throws when terminated
      }

      // Complete
      const result = this._comparisons[comparisonIndex];
      this._comparisonsCompleted.push({option1, option2, flip, result});
      ++comparisonIndex;
      comparisonCache.set(option1, option2, result);
      return result;
    };

    try {
      await timsort(orderedOptions, compare);
    } catch (e) {
      return; // Terminated
    }

    this._finalizeOrderedOptions(orderedOptions, comparisonCache);
    this.emit('complete', {orderedOptions});
  }

  _shouldFlip(option1, option2) {
    const ii = this._comparisonsCompleted.length;
    if (ii === 0) { return false; }
    let {flip, option1: option1Pre, option2: option2Pre} = this._comparisonsCompleted[ii - 1];
    if (flip) { [option1Pre, option2Pre] = [option2Pre, option1Pre]; }
    return (option1 === option2Pre || option2 === option1Pre);
  }

  _compareOptions(option1, option2, flip) {
    return new Promise((resolve, reject) => {
      this._currentComparisonResolve = resolve;
      this._currentComparisonReject = reject;
      this.emit('compare', {option1, option2, flip});
    });
  }

  _arraysEqual(array1, array2, count) {
    if (array1.length < count || array2.length < count) { return false; }
    for (let i = 0; i < count; ++i) {
      if (array1[i] !== array2[i]) { return false; }
    }
    return true;
  }

  _finalizeOrderedOptions(orderedOptions, comparisonCache) {
    const ii = orderedOptions.length;
    for (let i = 0; i < ii; ++i) {
      const option1 = orderedOptions[i];
      const optionPre = (i > 0 ? orderedOptions[i - 1] : null);
      const comparisonPre = (i > 0 ? comparisonCache.get(optionPre, option1) : void 0);
      option1.rank = (typeof comparisonPre !== 'undefined' && comparisonPre === 0 ? optionPre.rank : i);
    }
  }
}

class Main {
  constructor(configNode) {
    this._navigation = new Navigation();
    this._sorter = new Sorter();
    this._data = null;
    this._dataUrl = null;
    this._dataUrlMode = 'no-cors';
    this._optionsFlipped = false;
    this._optionInfos = [null, null];
    this._optionTransitionTimers = [null, null];
    this._transitionDuration = 250 + 20; // 20ms buffer
    this._compactResults = false;
    this._page = null;
    this._pageTransitionTimer = null;

    this._configure(configNode);
  }

  async prepare() {
    if (this._dataUrl === null) { return; }

    const imageLoader = new ImageLoader();
    imageLoader.preload();

    const [data] = await Promise.all([this._loadData(this._dataUrl), this._waitForPageLoad()]);
    this._data = data;
    this._setupData();
    imageLoader.load(data, this);

    document.querySelector('#results-copy-link').addEventListener('click', this._onResultsCopyLinkClick.bind(this));
    document.querySelector('#begin-button').addEventListener('click', this._onBeginButtonClick.bind(this));
    document.querySelector('#results-compact').addEventListener('change', this._onResultsCompactChange.bind(this));
    this._updateResultsCompactState();
    for (const option of document.querySelectorAll('.compare-option,.compare-option-equal')) {
      option.addEventListener('click', this._onOptionClick.bind(this));
    }
    for (const link of document.querySelectorAll('.navigation-link')) {
      link.addEventListener('click', this._onNavigationLinkClick.bind(this));
    }

    this._sorter.on('compare', this._onSortCompare.bind(this));
    this._sorter.on('complete', this._onSortComplete.bind(this));

    this._navigation.on('stateChange', this._onStateChange.bind(this));
    this._navigation.prepare(this._data.options.length);
  }

  normalizeUrl(url) {
    return new URL(url, this._dataUrl).href;
  }

  _configure(configNode) {
    const isObject = (v) => (typeof v === 'object' && v !== null);
    let config = null;
    if (isObject(configNode) && isObject(configNode.dataset)) {
      config = configNode.dataset.config;
      if (typeof config === 'string') {
        try {
          config = JSON.parse(config);
        } catch (e) {
          config = null;
        }
      }
    }
    if (isObject(config)) { this._setConfig(config); }
    this._setConfig(this._getConfigFromString(location.search));
    this._setConfig(this._getConfigFromString(location.hash.replace(/^#!?/, '')));
  }

  _getConfigFromString(string) {
    const params = new URLSearchParams(string);
    const toBool = (v) => (v === 'true' ? true : (v === 'false' ? false : void 0));
    const dataUrl = params.get('data');
    const dataUrlCors = toBool(params.get('cors'));
    const compactResults = toBool(params.get('compact'));
    return {dataUrl, dataUrlCors, compactResults};
  }

  _setConfig(config) {
    const {dataUrl, dataUrlCors, compactResults} = config;
    if (typeof dataUrl === 'string') {
      this._dataUrl = new URL(dataUrl, location.href).href;
    }
    if (typeof dataUrlCors === 'boolean') {
      this._dataUrlMode = (dataUrlCors ? 'cors' : 'no-cors');
    }
    if (typeof compactResults === 'boolean') {
      this._compactResults = compactResults;
    }
  }

  async _loadData(url) {
    const response = await fetch(url, {
      method: 'GET',
      mode: this._dataUrlMode,
      cache: 'default',
      credentials: 'omit',
      redirect: 'follow',
      referrerPolicy: 'no-referrer'
    });
    if (!response.ok) { throw new Error('Failed to fetch data'); }
    const data = await response.json();
    return data;
  }

  _waitForPageLoad() {
    return new Promise((resolve) => {
      if (document.readyState !== 'loading') {
        resolve();
      } else {
        window.addEventListener('DOMContentLoaded', () => resolve());
      }
    });
  }

  _onStateChange({state}) {
    this._selectOption(null);
    if (state === null) {
      this._setPageIntro();
    } else {
      const {sequence, comparisons} = state;
      this._sorter.setState(this._data.options, sequence, comparisons);
    }
  }

  _onOptionClick(e) {
    this._selectOption(e.currentTarget);
    this._tryContinue();
  }

  _onBeginButtonClick() {
    const sequence = this._sorter.createRandomSequence(this._data.options.length);
    this._navigation.setState(sequence, []);
  }

  _onResultsCopyLinkClick(e) {
    e.preventDefault();
    try {
      const parent = document.body;
      const textarea = document.createElement('textarea');
      textarea.value = e.currentTarget.getAttribute('href');
      parent.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      parent.removeChild(textarea);
    } catch (e) {
      // Ignore
    }
  }

  _onSortCompare({option1, option2, flip}) {
    this._setPageCompare(option1, option2, flip);
  }

  _onSortComplete({orderedOptions}) {
    this._setPageResults(orderedOptions);
  }

  _setupOptionInfo(optionInfo, index) {
    const selector = (index === 0 ? '#compare-option-first' : '#compare-option-second');
    const optionInfoOld = this._optionInfos[index];
    this._optionInfos[index] = optionInfo;
    const node = document.querySelector(selector);
    if ((optionInfoOld !== null ? optionInfoOld.option : null) === optionInfo.option) { return; }

    if (this._optionTransitionTimers[index] !== null) {
      clearTimeout(this._optionTransitionTimers[index]);
      this._optionTransitionTimers[index] = null;
    }

    if (optionInfoOld !== null) {
      node.hidden = true;
      this._optionTransitionTimers[index] = setTimeout(() => {
        this._optionTransitionTimers[index] = null;
        this._updateOptionDisplay(optionInfo.option, node);
      }, this._transitionDuration);
    } else {
      this._updateOptionDisplay(optionInfo.option, node);
    }
  }

  _updateOptionDisplay(option, node) {
    const {title, subTitle, image, icon} = option;
    node.querySelector('.header-title').textContent = title;
    node.querySelector('.header-sub-title').textContent = subTitle;
    node.querySelector('.compare-option-background').style.backgroundImage = (typeof image === 'string' ? ImageLoader.createCssUrl(this.normalizeUrl(image)) : '');
    node.querySelector('.header-icon').style.backgroundImage = (typeof icon === 'string' ? ImageLoader.createCssUrl(this.normalizeUrl(icon)) : '');
    node.hidden = false;
  }

  _selectOption(node) {
    let selected = 'none';
    const options = document.querySelectorAll('.compare-option,.compare-option-equal');
    for (let i = 0; i < options.length; ++i) {
      const option = options[i];
      const isSelected = (node === option ? !option.classList.contains('compare-option-selected') : false);
      option.classList.toggle('compare-option-selected', isSelected);
      if (isSelected) { selected = `${i}`; }
    }
    document.documentElement.dataset.selected = `${selected}`;
  }

  _resetAnimation(node) {
    const {style} = node;
    const {display} = style;
    style.setProperty('display', 'none', 'important');
    getComputedStyle(node).getPropertyValue('display');
    style.setProperty('display', display);
  }

  _tryContinue() {
    let value;
    if (document.querySelector('.compare-option-first').classList.contains('compare-option-selected')) { value = -1; }
    if (document.querySelector('.compare-option-second').classList.contains('compare-option-selected')) { value = 1; }
    if (document.querySelector('.compare-option-equal').classList.contains('compare-option-selected')) { value = 0; }
    if (typeof value === 'undefined') { return; }
    if (this._optionsFlipped) { value = -value; }
    const sequence = this._sorter.sequence;
    const comparisons = [...this._sorter.comparisons, value];
    this._navigation.setState(sequence, comparisons);
  }

  _setupData() {
    const {title, subTitle, navigation} = this._data;
    if (typeof title === 'string') {
      document.title = title;
      document.querySelector('#main-title').textContent = title;
    }
    if (typeof subTitle === 'string') {
      document.querySelector('#main-sub-title').textContent = subTitle;
    }
    if (Array.isArray(navigation)) {
      this._setupNavigationLinks(navigation);
    }
  }

  _setupNavigationLinks(navigationItems) {
    const container = document.querySelector('.header-navigation-links');
    if (container === null) { return; }

    const content = document.createDocumentFragment();
    let count = 0;
    for (const item of navigationItems) {
      let url, data, text, cors, compact;
      try {
        ({url, data, text, cors, compact} = item);
      } catch (e) {
        // Nothing
      }
      if (typeof text !== 'string') { continue; }

      if (count > 0) {
        const separator = document.createElement('span');
        separator.className = 'header-navigation-separator';
        content.appendChild(separator);
      }

      if (typeof url === 'string') {
        let relative;
        ({url, relative} = this._getRelativeUrl(url));
        if (!relative) { url = void 0; }
      }

      let node;
      if (typeof data === 'string') {
        ({url: data} = this._getRelativeUrl(data));

        const params = new URLSearchParams();
        params.set('data', data);
        if (typeof cors === 'boolean') { params.set('cors', `${cors}`); }
        if (typeof compact === 'boolean') { params.set('compact', `${compact}`); }
        const paramsString = params.toString().replace(/%2F/ig, '/').replace(/%3A/ig, ':');
        url = `${location.pathname}?${paramsString}`;

        node = document.createElement('a');
        node.href = url;
        node.className = 'header-navigation-link';
      } else if (typeof url === 'string') {
        node = document.createElement('a');
        node.href = url;
        node.className = 'header-navigation-link';
      } else {
        node = document.createElement('span');
        node.className = 'header-navigation-text';
      }

      node.textContent = text;
      content.appendChild(node);

      ++count;
    }

    if (count > 0) {
      container.textContent = '';
      container.appendChild(content);
      container.hidden = false;
    }
  }

  _getRelativeUrl(url) {
    url = new URL(url, this._dataUrl).href;
    const prefix = `${location.protocol}//${location.host}/`;
    const relative = url.startsWith(prefix);
    if (relative) {
      url = url.substring(prefix.length - 1);
    }
    return {url, relative};
  }

  _setStateSorting(sequence, comparisons) {
    this._sorter.setState(this._data.options, sequence, comparisons);
  }

  _updateNavigationLinks() {
    const {sequence} = this._sorter;
    const comparisons = this._sorter.getCompletedComparisons();

    let link = document.querySelector('#back-link');
    let url;
    if (comparisons.length > 0) {
      const comparisons2 = [...comparisons];
      comparisons2.splice(comparisons2.length - 1, 1);
      url = this._navigation.getStateUrl(sequence, comparisons2);
    } else {
      url = this._navigation.getStateUrl(null, null);
    }
    link.href = url;

    link = document.querySelector('#restart-link');
    link.href = this._navigation.getStateUrl(sequence, []);

    link = document.querySelector('#home-link');
    link.href = this._navigation.getStateUrl(null, null);
  }

  _onNavigationLinkClick(e) {
    if (e.button !== 0) { return; }
    try {
      this._navigation.setUrl(e.currentTarget.href);
      e.preventDefault();
    } catch (e) {
      // Nothing
    }
  }

  _createResultsItem(option, rank) {
    const {title, subTitle, image} = option;
    const itemNode = this._createElement('div', 'results-item');
    const imageContainerNode = this._createElement('div', 'results-image-container', itemNode);
    const imageNode = this._createElement('img', 'results-image', imageContainerNode);
    const indexNode = this._createElement('span', 'results-index', itemNode);
    const indexHeaderNode = this._createElement('h1', 'results-index-value', indexNode);
    itemNode.appendChild(document.createTextNode(' '));
    const resultsInfoNode = this._createElement('div', 'results-info', itemNode);
    const resultsTitleNode = this._createElement('h2', 'results-title', resultsInfoNode);
    const resultsSubTitleNode = this._createElement('h3', 'results-sub-title', resultsInfoNode);
    if (typeof image === 'string') {
      imageNode.src = this.normalizeUrl(image);
    } else {
      imageContainerNode.hidden = true;
    }
    indexHeaderNode.textContent = `#${rank + 1}`;
    resultsTitleNode.textContent = title;
    resultsSubTitleNode.textContent = subTitle;
    return itemNode;
  }

  _createElement(tag, className, parent) {
    const node = document.createElement(tag);
    node.className = className;
    if (typeof parent !== 'undefined') {
      parent.appendChild(node);
    }
    return node;
  }

  _updateResultsCompactState() {
    const resultsCompactCheckbox = document.querySelector('#results-compact');
    resultsCompactCheckbox.checked = this._compactResults;
    if (this._compactResults) {
      document.documentElement.dataset.compactResults = 'true';
    } else {
      delete document.documentElement.dataset.compactResults;
    }
  }

  _onResultsCompactChange(e) {
    this._compactResults = e.currentTarget.checked;
    this._updateResultsCompactState();
  }

  _setPage(value) {
    if (this._pageTransitionTimer !== null) {
      clearTimeout(this._pageTransitionTimer);
      this._pageTransitionTimer = null;
    }

    const transition = (this._page !== null && this._page !== value);
    this._page = value;

    const nodes = [
      {node: document.querySelector('#intro-content'),   hidden: (value !== 'intro')},
      {node: document.querySelector('#compare-content'), hidden: (value !== 'compare')},
      {node: document.querySelector('#results-content'), hidden: (value !== 'results')}
    ];

    if (!transition) {
      for (const {node, hidden} of nodes) {
        node.hidden = hidden;
      }
      return;
    }

    const hiddenClassName = 'sub-content-transition-hidden';
    for (const {node, hidden} of nodes) {
      if (hidden) { node.classList.add(hiddenClassName); }
    }

    this._pageTransitionTimer = setTimeout(() => {
      this._pageTransitionTimer = null;
      for (const {node, hidden} of nodes) {
        if (hidden) {
          node.hidden = true;
        } else {
          node.classList.add(hiddenClassName);
          node.hidden = false;
          getComputedStyle(node).getPropertyValue('display');
        }
        node.classList.remove(hiddenClassName);
      }
    }, this._transitionDuration);
  }

  _setPageIntro() {
    document.querySelector('#footer').hidden = true;
    this._setPage('intro');
    this._sorter.clear();
  }

  _setPageCompare(option1, option2, flip) {
    const {completedComparisonCount, approximateTotalComparisonCount} = this._sorter;
    const remaining = approximateTotalComparisonCount - completedComparisonCount;
    const remainingApprox = Math.ceil(remaining / 10) * 10;
    document.querySelector('#sorting-info').textContent = `${completedComparisonCount} comparison${completedComparisonCount === 1 ? '' : 's'} performed, ${remaining < 10 ? 'a few' : `~${remainingApprox}`} remaining`;
    document.querySelector('#footer').hidden = false;
    this._setPage('compare');
    this._optionsFlipped = flip;
    if (flip) { [option1, option2] = [option2, option1]; }
    this._setupOptionInfo(option1, 0);
    this._setupOptionInfo(option2, 1);
    this._updateNavigationLinks();
  }

  _setPageResults(orderedOptions) {
    document.querySelector('#results-copy-link').href = location.href;
    document.querySelector('#sorting-info').textContent = `Completed sorting after ${this._sorter.completedComparisonCount} comparisons`;
    document.querySelector('#footer').hidden = false;
    this._setPage('results');
    this._updateNavigationLinks();
    const fragment = document.createDocumentFragment();
    for (let i = 0, ii = orderedOptions.length; i < ii; ++i) {
      const {option, rank} = orderedOptions[i];
      const node = this._createResultsItem(option, rank);
      fragment.appendChild(node);
    }
    const resultsList = document.querySelector('#results-list');
    resultsList.textContent = '';
    resultsList.appendChild(fragment);
  }
}

new Main(document.currentScript).prepare();
