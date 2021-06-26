const timsort = (() => {
  const DEFAULT_MIN_MERGE = 32;
  const DEFAULT_MIN_GALLOPING = 7;
  const DEFAULT_TMP_STORAGE_LENGTH = 256;

  function minRunLength(n) {
    let r = 0;
    while (n >= DEFAULT_MIN_MERGE) {
      r |= (n & 1);
      n >>= 1;
    }
    return n + r;
  }

  async function makeAscendingRun(array, lo, hi, compare) {
    let runHi = lo + 1;

    if (runHi === hi) {
      return 1;
    }

    if (await compare(array[runHi++], array[lo]) < 0) {
      while (runHi < hi && await compare(array[runHi], array[runHi - 1]) < 0) {
        runHi++;
      }
      reverseRun(array, lo, runHi);
    } else {
      while (runHi < hi && await compare(array[runHi], array[runHi - 1]) >= 0) {
        runHi++;
      }
    }

    return runHi - lo;
  }

  function reverseRun(array, lo, hi) {
    hi--;
    while (lo < hi) {
      const t = array[lo];
      array[lo++] = array[hi];
      array[hi--] = t;
    }
  }

  async function binaryInsertionSort(array, lo, hi, start, compare) {
    if (start === lo) {
      start++;
    }

    for (; start < hi; start++) {
      const pivot = array[start];
      let left = lo;
      let right = start;

      while (left < right) {
        const mid = (left + right) >>> 1;

        if (await compare(pivot, array[mid]) < 0) {
          right = mid;
        } else {
          left = mid + 1;
        }
      }

      let n = start - left;
      switch (n) {
        case 3:
          array[left + 3] = array[left + 2];
          // fall through
        case 2:
          array[left + 2] = array[left + 1];
          // fall through
        case 1:
          array[left + 1] = array[left];
          break;
        default:
          while (n > 0) {
            array[left + n] = array[left + n - 1];
            n--;
          }
      }

      array[left] = pivot;
    }
  }

  async function gallopLeft(value, array, start, length, hint, compare) {
    let lastOffset = 0;
    let maxOffset = 0;
    let offset = 1;

    if (await compare(value, array[start + hint]) > 0) {
      maxOffset = length - hint;

      while (offset < maxOffset && await compare(value, array[start + hint + offset]) > 0) {
        lastOffset = offset;
        offset = (offset << 1) + 1;

        if (offset <= 0) {
          offset = maxOffset;
        }
      }

      if (offset > maxOffset) {
        offset = maxOffset;
      }

      lastOffset += hint;
      offset += hint;
    } else {
      maxOffset = hint + 1;
      while (offset < maxOffset && await compare(value, array[start + hint - offset]) <= 0) {
        lastOffset = offset;
        offset = (offset << 1) + 1;

        if (offset <= 0) {
          offset = maxOffset;
        }
      }
      if (offset > maxOffset) {
        offset = maxOffset;
      }

      const tmp = lastOffset;
      lastOffset = hint - offset;
      offset = hint - tmp;
    }

    lastOffset++;
    while (lastOffset < offset) {
      const m = lastOffset + ((offset - lastOffset) >>> 1);
      if (await compare(value, array[start + m]) > 0) {
        lastOffset = m + 1;
      } else {
        offset = m;
      }
    }
    return offset;
  }

  async function gallopRight(value, array, start, length, hint, compare) {
    let lastOffset = 0;
    let maxOffset = 0;
    let offset = 1;

    if (await compare(value, array[start + hint]) < 0) {
      maxOffset = hint + 1;

      while (offset < maxOffset && await compare(value, array[start + hint - offset]) < 0) {
        lastOffset = offset;
        offset = (offset << 1) + 1;

        if (offset <= 0) {
          offset = maxOffset;
        }
      }

      if (offset > maxOffset) {
        offset = maxOffset;
      }

      const tmp = lastOffset;
      lastOffset = hint - offset;
      offset = hint - tmp;
    } else {
      maxOffset = length - hint;

      while (offset < maxOffset && await compare(value, array[start + hint + offset]) >= 0) {
        lastOffset = offset;
        offset = (offset << 1) + 1;

        if (offset <= 0) {
          offset = maxOffset;
        }
      }

      if (offset > maxOffset) {
        offset = maxOffset;
      }

      lastOffset += hint;
      offset += hint;
    }

    lastOffset++;
    while (lastOffset < offset) {
      const m = lastOffset + ((offset - lastOffset) >>> 1);
      if (await compare(value, array[start + m]) < 0) {
        offset = m;
      } else {
        lastOffset = m + 1;
      }
    }

    return offset;
  }

  class TimSort {
    constructor(array, compare) {
      this.minGallop = DEFAULT_MIN_GALLOPING;
      this.length = 0;
      this.tmpStorageLength = DEFAULT_TMP_STORAGE_LENGTH;
      this.stackLength = 0;
      this.runStart = null;
      this.runLength = null;
      this.stackSize = 0;

      this.array = array;
      this.compare = compare;

      this.length = array.length;

      if (this.length < 2 * DEFAULT_TMP_STORAGE_LENGTH) {
        this.tmpStorageLength = this.length >>> 1;
      }

      this.tmp = new Array(this.tmpStorageLength);

      this.stackLength =
        (this.length < 120 ? 5 :
          this.length < 1542 ? 10 :
            this.length < 119151 ? 19 : 40);

      this.runStart = new Array(this.stackLength);
      this.runLength = new Array(this.stackLength);
    }

    pushRun(runStart, runLength) {
      this.runStart[this.stackSize] = runStart;
      this.runLength[this.stackSize] = runLength;
      this.stackSize += 1;
    }

    async mergeRuns() {
      while (this.stackSize > 1) {
        let n = this.stackSize - 2;

        if ((n >= 1 &&
          this.runLength[n - 1] <= this.runLength[n] + this.runLength[n + 1]) ||
          (n >= 2 &&
          this.runLength[n - 2] <= this.runLength[n] + this.runLength[n - 1])) {
          if (this.runLength[n - 1] < this.runLength[n + 1]) {
            n--;
          }
        } else if (this.runLength[n] > this.runLength[n + 1]) {
          break;
        }
        await this.mergeAt(n);
      }
    }

    async forceMergeRuns() {
      while (this.stackSize > 1) {
        let n = this.stackSize - 2;

        if (n > 0 && this.runLength[n - 1] < this.runLength[n + 1]) {
          n--;
        }

        await this.mergeAt(n);
      }
    }

    async mergeAt(i) {
      const compare = this.compare;
      const array = this.array;

      let start1 = this.runStart[i];
      let length1 = this.runLength[i];
      const start2 = this.runStart[i + 1];
      let length2 = this.runLength[i + 1];

      this.runLength[i] = length1 + length2;

      if (i === this.stackSize - 3) {
        this.runStart[i + 1] = this.runStart[i + 2];
        this.runLength[i + 1] = this.runLength[i + 2];
      }

      this.stackSize--;

      const k = await gallopRight(array[start2], array, start1, length1, 0, compare);
      start1 += k;
      length1 -= k;

      if (length1 === 0) {
        return;
      }

      length2 = await gallopLeft(array[start1 + length1 - 1], array, start2, length2, length2 - 1, compare);

      if (length2 === 0) {
        return;
      }

      if (length1 <= length2) {
        await this.mergeLow(start1, length1, start2, length2);
      } else {
        await this.mergeHigh(start1, length1, start2, length2);
      }
    }

    async mergeLow(start1, length1, start2, length2) {
      const compare = this.compare;
      const array = this.array;
      const tmp = this.tmp;
      let i = 0;

      for (i = 0; i < length1; i++) {
        tmp[i] = array[start1 + i];
      }

      let cursor1 = 0;
      let cursor2 = start2;
      let dest = start1;

      array[dest++] = array[cursor2++];

      if (--length2 === 0) {
        for (i = 0; i < length1; i++) {
          array[dest + i] = tmp[cursor1 + i];
        }
        return;
      }

      if (length1 === 1) {
        for (i = 0; i < length2; i++) {
          array[dest + i] = array[cursor2 + i];
        }
        array[dest + length2] = tmp[cursor1];
        return;
      }

      let minGallop = this.minGallop;

      while (true) {
        let count1 = 0;
        let count2 = 0;
        let exit = false;

        do {
          if (await compare(array[cursor2], tmp[cursor1]) < 0) {
            array[dest++] = array[cursor2++];
            count2++;
            count1 = 0;

            if (--length2 === 0) {
              exit = true;
              break;
            }
          } else {
            array[dest++] = tmp[cursor1++];
            count1++;
            count2 = 0;
            if (--length1 === 1) {
              exit = true;
              break;
            }
          }
        } while ((count1 | count2) < minGallop);

        if (exit) {
          break;
        }

        do {
          count1 = await gallopRight(array[cursor2], tmp, cursor1, length1, 0, compare);

          if (count1 !== 0) {
            for (i = 0; i < count1; i++) {
              array[dest + i] = tmp[cursor1 + i];
            }

            dest += count1;
            cursor1 += count1;
            length1 -= count1;
            if (length1 <= 1) {
              exit = true;
              break;
            }
          }

          array[dest++] = array[cursor2++];

          if (--length2 === 0) {
            exit = true;
            break;
          }

          count2 = await gallopLeft(tmp[cursor1], array, cursor2, length2, 0, compare);

          if (count2 !== 0) {
            for (i = 0; i < count2; i++) {
              array[dest + i] = array[cursor2 + i];
            }

            dest += count2;
            cursor2 += count2;
            length2 -= count2;

            if (length2 === 0) {
              exit = true;
              break;
            }
          }
          array[dest++] = tmp[cursor1++];

          if (--length1 === 1) {
            exit = true;
            break;
          }

          minGallop--;
        } while (count1 >= DEFAULT_MIN_GALLOPING || count2 >= DEFAULT_MIN_GALLOPING);

        if (exit) {
          break;
        }

        if (minGallop < 0) {
          minGallop = 0;
        }

        minGallop += 2;
      }

      this.minGallop = minGallop;

      if (minGallop < 1) {
        this.minGallop = 1;
      }

      if (length1 === 1) {
        for (i = 0; i < length2; i++) {
          array[dest + i] = array[cursor2 + i];
        }
        array[dest + length2] = tmp[cursor1];
      } else if (length1 === 0) {
        throw new Error('mergeLow preconditions were not respected');
      } else {
        for (i = 0; i < length1; i++) {
          array[dest + i] = tmp[cursor1 + i];
        }
      }
    }

    async mergeHigh(start1, length1, start2, length2) {
      const compare = this.compare;
      const array = this.array;
      const tmp = this.tmp;
      let i = 0;

      for (i = 0; i < length2; i++) {
        tmp[i] = array[start2 + i];
      }

      let cursor1 = start1 + length1 - 1;
      let cursor2 = length2 - 1;
      let dest = start2 + length2 - 1;
      let customCursor = 0;
      let customDest = 0;

      array[dest--] = array[cursor1--];

      if (--length1 === 0) {
        customCursor = dest - (length2 - 1);

        for (i = 0; i < length2; i++) {
          array[customCursor + i] = tmp[i];
        }

        return;
      }

      if (length2 === 1) {
        dest -= length1;
        cursor1 -= length1;
        customDest = dest + 1;
        customCursor = cursor1 + 1;

        for (i = length1 - 1; i >= 0; i--) {
          array[customDest + i] = array[customCursor + i];
        }

        array[dest] = tmp[cursor2];
        return;
      }

      let minGallop = this.minGallop;

      while (true) {
        let count1 = 0;
        let count2 = 0;
        let exit = false;

        do {
          if (await compare(tmp[cursor2], array[cursor1]) < 0) {
            array[dest--] = array[cursor1--];
            count1++;
            count2 = 0;
            if (--length1 === 0) {
              exit = true;
              break;
            }
          } else {
            array[dest--] = tmp[cursor2--];
            count2++;
            count1 = 0;
            if (--length2 === 1) {
              exit = true;
              break;
            }
          }
        } while ((count1 | count2) < minGallop);

        if (exit) {
          break;
        }

        do {
          count1 = length1 - await gallopRight(tmp[cursor2], array, start1, length1, length1 - 1, compare);

          if (count1 !== 0) {
            dest -= count1;
            cursor1 -= count1;
            length1 -= count1;
            customDest = dest + 1;
            customCursor = cursor1 + 1;

            for (i = count1 - 1; i >= 0; i--) {
              array[customDest + i] = array[customCursor + i];
            }

            if (length1 === 0) {
              exit = true;
              break;
            }
          }

          array[dest--] = tmp[cursor2--];

          if (--length2 === 1) {
            exit = true;
            break;
          }

          count2 = length2 - await gallopLeft(array[cursor1], tmp, 0, length2, length2 - 1, compare);

          if (count2 !== 0) {
            dest -= count2;
            cursor2 -= count2;
            length2 -= count2;
            customDest = dest + 1;
            customCursor = cursor2 + 1;

            for (i = 0; i < count2; i++) {
              array[customDest + i] = tmp[customCursor + i];
            }

            if (length2 <= 1) {
              exit = true;
              break;
            }
          }

          array[dest--] = array[cursor1--];

          if (--length1 === 0) {
            exit = true;
            break;
          }

          minGallop--;
        } while (count1 >= DEFAULT_MIN_GALLOPING || count2 >= DEFAULT_MIN_GALLOPING);

        if (exit) {
          break;
        }

        if (minGallop < 0) {
          minGallop = 0;
        }

        minGallop += 2;
      }

      this.minGallop = minGallop;

      if (minGallop < 1) {
        this.minGallop = 1;
      }

      if (length2 === 1) {
        dest -= length1;
        cursor1 -= length1;
        customDest = dest + 1;
        customCursor = cursor1 + 1;

        for (i = length1 - 1; i >= 0; i--) {
          array[customDest + i] = array[customCursor + i];
        }

        array[dest] = tmp[cursor2];
      } else if (length2 === 0) {
        throw new Error('mergeHigh preconditions were not respected');
      } else {
        customCursor = dest - (length2 - 1);
        for (i = 0; i < length2; i++) {
          array[customCursor + i] = tmp[i];
        }
      }
    }
  }

  async function timsort(array, compare) {
    let lo = 0;
    const hi = array.length;

    let remaining = hi - lo;

    if (remaining < 2) {
      return;
    }

    let runLength = 0;
    if (remaining < DEFAULT_MIN_MERGE) {
      runLength = await makeAscendingRun(array, lo, hi, compare);
      await binaryInsertionSort(array, lo, hi, lo + runLength, compare);
      return;
    }

    const ts = new TimSort(array, compare);
    const minRun = minRunLength(remaining);

    do {
      runLength = await makeAscendingRun(array, lo, hi, compare);
      if (runLength < minRun) {
        let force = remaining;
        if (force > minRun) {
          force = minRun;
        }

        await binaryInsertionSort(array, lo, lo + force, lo + runLength, compare);
        runLength = force;
      }
      ts.pushRun(lo, runLength);
      await ts.mergeRuns();

      remaining -= runLength;
      lo += runLength;
    } while (remaining !== 0);

    await ts.forceMergeRuns();
  }

  // This is an approximation based on merge-insertion sort
  timsort.getApproximateComparisonCount = function getApproximateComparisonCount(n) {
    return (
      n * Math.ceil(Math.log2(n * (3 / 4))) -
      Math.floor(Math.pow(2, Math.floor(Math.log2(6 * n))) / 3) +
      Math.floor(Math.log2(6 * n) / 2)
    );
  };

  return timsort;
})();
