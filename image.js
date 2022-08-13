class ImageExporter {
  constructor(main, data, orderedOptions) {
    this._main = main;
    this._data = data;
    this._orderedOptions = orderedOptions;
    this._promiseData = null;
    this._links = document.querySelectorAll('.results-link[data-ation=download-image]');
  }

  async prepare() {
    const onResultsDownloadImageClick = this._onResultsDownloadImageClick.bind(this);
    for (const link of this._links) {
      link.addEventListener('click', onResultsDownloadImageClick);
      link.addEventListener('auxclick', onResultsDownloadImageClick);
    }

    this._promiseData = await Promise.all([
      this._loadData(),
      ...this._orderedOptions.map((orderedOption) => this._loadItemData(orderedOption)),
    ]);

    for (const link of this._links) {
      delete link.dataset.disabled;
    }
  }

  _onResultsDownloadImageClick(e) {
    if (this._promiseData === null) {
      e.preventDefault();
      return;
    }

    const node = e.currentTarget;
    if (!node.hasAttribute('href')) {
      if (e.type === 'auxclick') { return; }
      const [data, ...resultData] = this._promiseData;
      const canvas = this._render(data, resultData, 16);
      for (const link of this._links) {
        if (link.hasAttribute('href')) { continue; }
        let {type, quality} = link.dataset;
        quality = Number.parseFloat(quality);
        const extension = this._getExtension(type);
        const blob = this._canvasToBlob(canvas, type, quality);
        const blobUrl = URL.createObjectURL(blob);
        link.href = blobUrl;
        link.download = `results${extension}`;
      }
    }

    // Allow middle click without download
    if (e.type === 'auxclick') {
      const {download} = node;
      node.removeAttribute('download');
      setTimeout(() => { node.download = download; }, 0);
    }
  }

  _render(data, resultData, size) {
    const imageWidth = 10 * size;
    const imageHeight = 5.625 * size;
    const itemSpacing = size;
    const textSpacing = size;
    const subTitleSpacing = size * 0.5;
    const paddingHorizontal = size * 1.5;
    const paddingVertical = size * 1.5;
    const font = 'Arial, sans-serif';
    const fontRank = `normal ${size * 3}px ${font}`;
    const fontTitle = `normal ${size * 2}px ${font}`;
    const fontSubTitle = `normal ${size}px ${font}`;
    const fontColor = '#333333';

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.imageSmoothingEnabled = true;
    context.textBaseline = 'alphabetic';
    context.fillStyle = fontColor;

    let maxTextWidth = 0;
    for (const item of resultData) {
      const {title, subTitle, rank} = item;

      context.font = fontRank;
      item.rankMetrics = context.measureText(rank);

      context.font = fontTitle;
      item.titleMetrics = context.measureText(title);

      context.font = fontSubTitle;
      item.subTitleMetrics = context.measureText(subTitle);

      const textWidth = item.rankMetrics.width + Math.max(item.titleMetrics.width, item.subTitleMetrics.width);
      maxTextWidth = Math.max(maxTextWidth, textWidth);
    }

    const canvasWidth = Math.min(2000, Math.ceil(paddingHorizontal * 2 + maxTextWidth + imageWidth + textSpacing * 2));
    const canvasHeight = Math.min(20000, Math.ceil(resultData.length * imageHeight + (resultData.length - 1) * itemSpacing + paddingVertical * 2));
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    context.fillStyle = '#fff';
    if (data.backgroundImage !== null && !data.backgroundImageError) {
      context.fillStyle = context.createPattern(data.backgroundImage, 'repeat');
    }
    context.fillRect(0, 0, canvasWidth, canvasHeight);

    context.fillStyle = fontColor;
    for (let i = 0, ii = resultData.length; i < ii; ++i) {
      const {
        image,
        imageError,
        title,
        subTitle,
        rank,
        titleMetrics,
        subTitleMetrics,
        rankMetrics,
      } = resultData[i];
      const hasTitleAndSubtitle = (title.length > 0 && subTitle.length > 0);
      const y1 = paddingVertical + (imageHeight + itemSpacing) * i;

      if (image !== null && !imageError) {
        context.filter = 'drop-shadow(1px 1px 2px #00000080) drop-shadow(1px 1px 2px #00000080)';
        this._drawImageCover(context, image, paddingHorizontal, y1, imageWidth, imageHeight);
        context.filter = 'none';
      }

      const x1 = paddingHorizontal + imageWidth + textSpacing;
      context.font = fontRank;
      context.fillText(rank, x1, y1 + (imageHeight + rankMetrics.actualBoundingBoxAscent) * 0.5);

      const x2 = paddingHorizontal + imageWidth + textSpacing * 2 + rankMetrics.width;
      let y2 = y1 + (imageHeight + titleMetrics.actualBoundingBoxAscent) * 0.5;
      if (hasTitleAndSubtitle) { y2 -= (subTitleMetrics.actualBoundingBoxAscent + subTitleSpacing) * 0.5; }
      context.font = fontTitle;
      context.fillText(title, x2, y2);

      y2 = y1 + (imageHeight + subTitleMetrics.actualBoundingBoxAscent) * 0.5;
      if (hasTitleAndSubtitle) { y2 += (titleMetrics.actualBoundingBoxAscent + subTitleSpacing) * 0.5; }
      context.font = fontSubTitle;
      context.fillText(subTitle, x2, y2);
    }

    return canvas;
  }

  _canvasToBlob(canvas, imageType, quality) {
    const png = canvas.toDataURL(imageType, quality);
    const content = this._binaryStringToUint8Array(atob(png.substring(png.indexOf(',') + 1)));
    return new Blob([content], {type: imageType});
  }

  _getExtension(type) {
    switch (type) {
      case 'image/jpeg': return '.jpg';
      default: return '.png';
    }
  }

  async _loadData() {
    const {background} = this._data;
    let backgroundImage = null;
    let backgroundImageError = false;
    if (typeof background === 'string') {
      ({image: backgroundImage, error: backgroundImageError} = await this._loadImage(this._main.normalizeUrl(background)));
    }
    return {backgroundImage, backgroundImageError};
  }

  async _loadItemData({rank, option: {title, subTitle, image: imageUrl}}) {
    let image = null;
    let imageError = false;
    if (typeof imageUrl === 'string') {
      ({image, error: imageError} = await this._loadImage(this._main.normalizeUrl(imageUrl)));
    }
    rank = `#${rank + 1}`;
    if (typeof title !== 'string') { title = ''; }
    if (typeof subTitle !== 'string') { subTitle = ''; }
    return {image, imageError, title, subTitle, rank};
  }

  _loadImage(url) {
    return new Promise((resolve) => {
      const image = new Image();
      image.addEventListener('load', () => resolve({image, error: false}));
      image.addEventListener('error', () => resolve({image, error: true}));
      image.src = url;
    });
  }

  _binaryStringToUint8Array(string) {
    const ii = string.length;
    const array = new Uint8Array(ii);
    for (let i = 0; i < ii; ++i) {
      array[i] = string.charCodeAt(i);
    }
    return array;
  }

  _drawImageCover(context, image, dx, dy, dWidth, dHeight) {
    let {naturalWidth: sWidth, naturalHeight: sHeight} = image;
    const aspect = sWidth / sHeight;
    const dAspect = dWidth / dHeight;
    let sx = 0;
    let sy = 0;
    if (aspect < dAspect) {
      const height0 = sHeight;
      sHeight *= aspect / dAspect;
      sy = (height0 - sHeight) * 0.5;
    } else {
      const width0 = sWidth;
      sWidth *= dAspect / aspect;
      sx = (width0 - sWidth) * 0.5;
    }
    context.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
  }
}
