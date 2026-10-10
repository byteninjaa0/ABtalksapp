// The 30 questions of "Array and String Mastery in 15 Days".
//
// The JavaScript reference solutions are also run on Judge0's Node.js 12, so
// they must not use syntax newer than that (no `??`, `?.`, `replaceAll`, `.at`).
//
// Each entry is the single source for one question: statement, typed
// signature, a JavaScript reference solution (it computes every expected
// output), a Python solution (stored with the question and re-checked by
// `npm run coding-practice:verify`), two sample tests and two hard hidden
// tests. Hidden tests are generated from a fixed seed, so regenerating gives
// byte-identical files.
//
// `java` / `cpp` solutions exist for one question per distinct signature.
// They are used only to prove the generated drivers for those languages.

const r = String.raw;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ri = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const ints = (rand, n, lo, hi) => Array.from({ length: n }, () => ri(rand, lo, hi));
function shuffle(rand, a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const chars = (rand, n, alphabet) =>
  Array.from({ length: n }, () => alphabet[Math.floor(rand() * alphabet.length)]).join("");
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const asc = (a, b) => a - b;

function md(body, constraints) {
  return `${body.trim()}\n\n**Constraints**\n\n${constraints.map((c) => `- ${c}`).join("\n")}`;
}

// ── Reference solutions (JavaScript). Names must match `fn`. ────────────────

function largestTwo(arr) {
  let a = -1;
  let b = -1;
  for (const x of arr) {
    if (x > a) {
      b = a;
      a = x;
    } else if (x < a && x > b) {
      b = x;
    }
  }
  return [a, b];
}

function maxSubArray(nums) {
  let best = nums[0];
  let cur = nums[0];
  for (let i = 1; i < nums.length; i++) {
    cur = Math.max(nums[i], cur + nums[i]);
    best = Math.max(best, cur);
  }
  return best;
}

function removeDuplicates(nums) {
  const out = [];
  for (const x of nums) {
    if (out.length === 0 || out[out.length - 1] !== x) out.push(x);
  }
  return out;
}

function majorityElement(nums) {
  let candidate = 0;
  let count = 0;
  for (const x of nums) {
    if (count === 0) candidate = x;
    count += x === candidate ? 1 : -1;
  }
  return candidate;
}

function moveZeroes(nums) {
  const out = nums.filter((x) => x !== 0);
  while (out.length < nums.length) out.push(0);
  return out;
}

function maxArea(height) {
  let i = 0;
  let j = height.length - 1;
  let best = 0;
  while (i < j) {
    best = Math.max(best, Math.min(height[i], height[j]) * (j - i));
    if (height[i] < height[j]) i++;
    else j--;
  }
  return best;
}

function twoSum(numbers, target) {
  let i = 0;
  let j = numbers.length - 1;
  while (i < j) {
    const s = numbers[i] + numbers[j];
    if (s === target) return [i + 1, j + 1];
    if (s < target) i++;
    else j--;
  }
  return [];
}

function threeSum(nums) {
  const a = [...nums].sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i < a.length - 2; i++) {
    if (i > 0 && a[i] === a[i - 1]) continue;
    let l = i + 1;
    let h = a.length - 1;
    while (l < h) {
      const s = a[i] + a[l] + a[h];
      if (s === 0) {
        out.push([a[i], a[l], a[h]]);
        while (l < h && a[l] === a[l + 1]) l++;
        while (l < h && a[h] === a[h - 1]) h--;
        l++;
        h--;
      } else if (s < 0) {
        l++;
      } else {
        h--;
      }
    }
  }
  return out;
}

function rangeSum(nums, queries) {
  const prefix = [0];
  for (const x of nums) prefix.push(prefix[prefix.length - 1] + x);
  return queries.map(([l, h]) => prefix[h + 1] - prefix[l]);
}

function subarraySum(nums, k) {
  const seen = new Map([[0, 1]]);
  let sum = 0;
  let count = 0;
  for (const x of nums) {
    sum += x;
    count += seen.get(sum - k) || 0;
    seen.set(sum, (seen.get(sum) || 0) + 1);
  }
  return count;
}

function containsDuplicate(nums) {
  return new Set(nums).size !== nums.length;
}

function longestConsecutive(nums) {
  const set = new Set(nums);
  let best = 0;
  for (const x of set) {
    if (set.has(x - 1)) continue;
    let len = 1;
    while (set.has(x + len)) len++;
    best = Math.max(best, len);
  }
  return best;
}

function maxSumSubarray(arr, k) {
  let sum = 0;
  for (let i = 0; i < k; i++) sum += arr[i];
  let best = sum;
  for (let i = k; i < arr.length; i++) {
    sum += arr[i] - arr[i - k];
    best = Math.max(best, sum);
  }
  return best;
}

function longestSubarrayWithSumK(arr, k) {
  const first = new Map([[0, -1]]);
  let sum = 0;
  let best = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (first.has(sum - k)) best = Math.max(best, i - first.get(sum - k));
    if (!first.has(sum)) first.set(sum, i);
  }
  return best;
}

function maxProfit(prices) {
  let low = prices[0];
  let best = 0;
  for (const p of prices) {
    low = Math.min(low, p);
    best = Math.max(best, p - low);
  }
  return best;
}

function productExceptSelf(nums) {
  const n = nums.length;
  const out = new Array(n).fill(1);
  let left = 1;
  for (let i = 0; i < n; i++) {
    out[i] = left;
    left *= nums[i];
  }
  let right = 1;
  for (let i = n - 1; i >= 0; i--) {
    out[i] *= right;
    right *= nums[i];
  }
  // Avoid printing -0.
  return out.map((x) => (x === 0 ? 0 : x));
}

function mergeSortedArrays(a, b) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) out.push(a[i] <= b[j] ? a[i++] : b[j++]);
  while (i < a.length) out.push(a[i++]);
  while (j < b.length) out.push(b[j++]);
  return out;
}

function mergeIntervals(intervals) {
  const a = intervals.map((x) => [...x]).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const cur of a) {
    const last = out[out.length - 1];
    if (last && cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
    else out.push(cur);
  }
  return out;
}

function transpose(matrix) {
  return matrix[0].map((_, c) => matrix.map((row) => row[c]));
}

function setZeroes(matrix) {
  const rows = new Set();
  const cols = new Set();
  matrix.forEach((row, i) =>
    row.forEach((v, j) => {
      if (v === 0) {
        rows.add(i);
        cols.add(j);
      }
    }),
  );
  return matrix.map((row, i) => row.map((v, j) => (rows.has(i) || cols.has(j) ? 0 : v)));
}

function isPalindrome(s) {
  const t = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (let i = 0, j = t.length - 1; i < j; i++, j--) {
    if (t[i] !== t[j]) return false;
  }
  return true;
}

function longestPalindrome(s) {
  let start = 0;
  let len = s.length > 0 ? 1 : 0;
  const grow = (l, h) => {
    while (l >= 0 && h < s.length && s[l] === s[h]) {
      l--;
      h++;
    }
    if (h - l - 1 > len) {
      len = h - l - 1;
      start = l + 1;
    }
  };
  for (let i = 0; i < s.length; i++) {
    grow(i, i);
    grow(i, i + 1);
  }
  return s.slice(start, start + len);
}

function isAnagram(s, t) {
  if (s.length !== t.length) return false;
  const count = new Map();
  for (const c of s) count.set(c, (count.get(c) || 0) + 1);
  for (const c of t) {
    const left = (count.get(c) || 0) - 1;
    if (left < 0) return false;
    count.set(c, left);
  }
  return true;
}

function groupAnagrams(strs) {
  const groups = new Map();
  for (const w of strs) {
    const key = [...w].sort().join("");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);
  }
  return [...groups.values()];
}

function lengthOfLongestSubstring(s) {
  const last = new Map();
  let start = 0;
  let best = 0;
  for (let i = 0; i < s.length; i++) {
    const seen = last.get(s[i]);
    if (seen !== undefined && seen >= start) start = seen + 1;
    last.set(s[i], i);
    best = Math.max(best, i - start + 1);
  }
  return best;
}

function minWindow(s, t) {
  const need = new Map();
  for (const c of t) need.set(c, (need.get(c) || 0) + 1);
  let missing = t.length;
  let bestStart = 0;
  let bestLen = Infinity;
  let l = 0;
  for (let h = 0; h < s.length; h++) {
    const c = s[h];
    if ((need.get(c) || 0) > 0) missing--;
    need.set(c, (need.get(c) || 0) - 1);
    while (missing === 0) {
      if (h - l + 1 < bestLen) {
        bestLen = h - l + 1;
        bestStart = l;
      }
      const d = s[l];
      need.set(d, need.get(d) + 1);
      if (need.get(d) > 0) missing++;
      l++;
    }
  }
  return bestLen === Infinity ? "" : s.slice(bestStart, bestStart + bestLen);
}

function reverseWords(s) {
  return s.split(" ").filter((w) => w !== "").reverse().join(" ");
}

function compress(s) {
  let out = "";
  let i = 0;
  while (i < s.length) {
    let j = i;
    while (j < s.length && s[j] === s[i]) j++;
    out += s[i] + (j - i > 1 ? String(j - i) : "");
    i = j;
  }
  return out;
}

function rotate(nums, k) {
  const n = nums.length;
  const shift = k % n;
  return nums.map((_, i) => nums[(i - shift + n) % n]);
}

function trap(height) {
  let l = 0;
  let h = height.length - 1;
  let maxL = 0;
  let maxR = 0;
  let water = 0;
  while (l < h) {
    if (height[l] < height[h]) {
      maxL = Math.max(maxL, height[l]);
      water += maxL - height[l];
      l++;
    } else {
      maxR = Math.max(maxR, height[h]);
      water += maxR - height[h];
      h--;
    }
  }
  return water;
}

// ── Hidden-test builders that need care ─────────────────────────────────────

/** Sorted, strictly increasing, with exactly one pair that sums to the target. */
function twoSumCase(p, q) {
  const n = 15000;
  const a = Array.from({ length: n }, (_, i) => -30000 + 4 * i);
  a[p] += 1;
  a[q] += 2;
  return [a, a[p] + a[q]];
}

function palindromeCase(seed, half, where, even) {
  const rand = rng(seed);
  const side = chars(rand, half, "defgh");
  const core = side + (even ? "" : "x") + [...side].reverse().join("");
  const noise = (n) => chars(rand, n, "abc");
  const total = 1000 - core.length;
  const before = where === "end" ? total : Math.floor(total / 2);
  const s = noise(before) + core + noise(total - before);
  const best = longestPalindrome(s);
  let count = 0;
  for (let i = 0; i + best.length <= s.length; i++) {
    const sub = s.slice(i, i + best.length);
    if (sub === [...sub].reverse().join("")) count++;
  }
  if (count !== 1) throw new Error("longest palindrome is not unique");
  return [s];
}

function decorate(rand, core) {
  let out = "";
  for (const c of core) {
    out += rand() < 0.5 ? c.toUpperCase() : c;
    if (rand() < 0.3) out += " ,.:;!?-"[Math.floor(rand() * 8)];
  }
  return out;
}

function validPalindromeCase(seed, broken) {
  const rand = rng(seed);
  const half = [...chars(rand, 15000, LOWER + "0123456789")];
  const core = [...half, ...[...half].reverse()];
  if (broken) core[14990] = core[14990] === "q" ? "z" : "q";
  return [decorate(rand, core.join(""))];
}

function minWindowUnique(seed) {
  for (let s0 = seed; s0 < seed + 200; s0++) {
    const rand = rng(s0);
    const s = chars(rand, 20000, "ABCDEF");
    const t = chars(rand, 40, "ABCDEF");
    const best = minWindow(s, t);
    if (best === "") continue;
    let count = 0;
    for (let i = 0; i + best.length <= s.length; i++) {
      if (minWindow(s.slice(i, i + best.length), t) !== "") count++;
      if (count > 1) break;
    }
    if (count === 1) return [s, t];
  }
  throw new Error("no unique minimum window found");
}

function noWindowCase(seed) {
  const s = chars(rng(seed), 20000, "ABCDE");
  const countA = [...s].filter((c) => c === "A").length;
  return [s, "A".repeat(countA + 1)];
}

function runsCase(seed) {
  const rand = rng(seed);
  let s = "";
  let prev = "";
  while (s.length < 50000) {
    let c = LOWER[ri(rand, 0, 25)];
    if (c === prev) c = c === "a" ? "b" : "a";
    s += c.repeat(ri(rand, 1, 300));
    prev = c;
  }
  return [s];
}

function wordsCase(seed, count, maxLen, maxGap) {
  const rand = rng(seed);
  let s = "   ";
  for (let i = 0; i < count; i++) {
    s += chars(rand, ri(rand, 1, maxLen), LOWER) + " ".repeat(ri(rand, 1, maxGap));
  }
  return [s + " "];
}

// ── Java and C++ solutions, one per distinct signature ──────────────────────

const JAVA = {
  largestTwo: r`class Solution {
    public int[] largestTwo(int[] arr) {
        int a = -1, b = -1;
        for (int x : arr) {
            if (x > a) { b = a; a = x; }
            else if (x < a && x > b) b = x;
        }
        return new int[] { a, b };
    }
}
`,
  maxSubArray: r`class Solution {
    public int maxSubArray(int[] nums) {
        int best = nums[0], cur = nums[0];
        for (int i = 1; i < nums.length; i++) {
            cur = Math.max(nums[i], cur + nums[i]);
            best = Math.max(best, cur);
        }
        return best;
    }
}
`,
  twoSum: r`class Solution {
    public int[] twoSum(int[] numbers, int target) {
        int i = 0, j = numbers.length - 1;
        while (i < j) {
            int s = numbers[i] + numbers[j];
            if (s == target) return new int[] { i + 1, j + 1 };
            if (s < target) i++; else j--;
        }
        return new int[0];
    }
}
`,
  threeSum: r`class Solution {
    public List<List<Integer>> threeSum(int[] nums) {
        Arrays.sort(nums);
        List<List<Integer>> out = new ArrayList<>();
        for (int i = 0; i < nums.length - 2; i++) {
            if (i > 0 && nums[i] == nums[i - 1]) continue;
            int l = i + 1, h = nums.length - 1;
            while (l < h) {
                int s = nums[i] + nums[l] + nums[h];
                if (s == 0) {
                    out.add(Arrays.asList(nums[h], nums[i], nums[l]));
                    while (l < h && nums[l] == nums[l + 1]) l++;
                    while (l < h && nums[h] == nums[h - 1]) h--;
                    l++; h--;
                } else if (s < 0) l++; else h--;
            }
        }
        Collections.reverse(out);
        return out;
    }
}
`,
  rangeSum: r`class Solution {
    public int[] rangeSum(int[] nums, int[][] queries) {
        int[] prefix = new int[nums.length + 1];
        for (int i = 0; i < nums.length; i++) prefix[i + 1] = prefix[i] + nums[i];
        int[] out = new int[queries.length];
        for (int i = 0; i < queries.length; i++) out[i] = prefix[queries[i][1] + 1] - prefix[queries[i][0]];
        return out;
    }
}
`,
  subarraySum: r`class Solution {
    public int subarraySum(int[] nums, int k) {
        Map<Integer, Integer> seen = new HashMap<>();
        seen.put(0, 1);
        int sum = 0, count = 0;
        for (int x : nums) {
            sum += x;
            count += seen.getOrDefault(sum - k, 0);
            seen.merge(sum, 1, Integer::sum);
        }
        return count;
    }
}
`,
  containsDuplicate: r`class Solution {
    public boolean containsDuplicate(int[] nums) {
        Set<Integer> seen = new HashSet<>();
        for (int x : nums) if (!seen.add(x)) return true;
        return false;
    }
}
`,
  mergeSortedArrays: r`class Solution {
    public int[] mergeSortedArrays(int[] a, int[] b) {
        int[] out = new int[a.length + b.length];
        int i = 0, j = 0, k = 0;
        while (i < a.length && j < b.length) out[k++] = a[i] <= b[j] ? a[i++] : b[j++];
        while (i < a.length) out[k++] = a[i++];
        while (j < b.length) out[k++] = b[j++];
        return out;
    }
}
`,
  transpose: r`class Solution {
    public int[][] transpose(int[][] matrix) {
        int[][] out = new int[matrix[0].length][matrix.length];
        for (int i = 0; i < matrix.length; i++)
            for (int j = 0; j < matrix[0].length; j++) out[j][i] = matrix[i][j];
        return out;
    }
}
`,
  isPalindrome: r`class Solution {
    public boolean isPalindrome(String s) {
        int i = 0, j = s.length() - 1;
        while (i < j) {
            if (!Character.isLetterOrDigit(s.charAt(i))) { i++; continue; }
            if (!Character.isLetterOrDigit(s.charAt(j))) { j--; continue; }
            if (Character.toLowerCase(s.charAt(i)) != Character.toLowerCase(s.charAt(j))) return false;
            i++; j--;
        }
        return true;
    }
}
`,
  reverseWords: r`class Solution {
    public String reverseWords(String s) {
        String[] parts = s.trim().split(" +");
        StringBuilder sb = new StringBuilder();
        for (int i = parts.length - 1; i >= 0; i--) {
            sb.append(parts[i]);
            if (i > 0) sb.append(' ');
        }
        return sb.toString();
    }
}
`,
  isAnagram: r`class Solution {
    public boolean isAnagram(String s, String t) {
        if (s.length() != t.length()) return false;
        int[] count = new int[128];
        for (char c : s.toCharArray()) count[c]++;
        for (char c : t.toCharArray()) if (--count[c] < 0) return false;
        return true;
    }
}
`,
  groupAnagrams: r`class Solution {
    public List<List<String>> groupAnagrams(String[] strs) {
        Map<String, List<String>> groups = new HashMap<>();
        for (String w : strs) {
            char[] cs = w.toCharArray();
            Arrays.sort(cs);
            groups.computeIfAbsent(new String(cs), key -> new ArrayList<>()).add(w);
        }
        return new ArrayList<>(groups.values());
    }
}
`,
  lengthOfLongestSubstring: r`class Solution {
    public int lengthOfLongestSubstring(String s) {
        int[] last = new int[128];
        Arrays.fill(last, -1);
        int start = 0, best = 0;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (last[c] >= start) start = last[c] + 1;
            last[c] = i;
            best = Math.max(best, i - start + 1);
        }
        return best;
    }
}
`,
  minWindow: r`class Solution {
    public String minWindow(String s, String t) {
        int[] need = new int[128];
        for (char c : t.toCharArray()) need[c]++;
        int missing = t.length(), bestStart = 0, bestLen = Integer.MAX_VALUE, l = 0;
        for (int h = 0; h < s.length(); h++) {
            if (need[s.charAt(h)]-- > 0) missing--;
            while (missing == 0) {
                if (h - l + 1 < bestLen) { bestLen = h - l + 1; bestStart = l; }
                if (++need[s.charAt(l)] > 0) missing++;
                l++;
            }
        }
        return bestLen == Integer.MAX_VALUE ? "" : s.substring(bestStart, bestStart + bestLen);
    }
}
`,
};

const CPP = {
  largestTwo: r`class Solution {
public:
    vector<int> largestTwo(vector<int>& arr) {
        int a = -1, b = -1;
        for (int x : arr) {
            if (x > a) { b = a; a = x; }
            else if (x < a && x > b) b = x;
        }
        return {a, b};
    }
};
`,
  maxSubArray: r`class Solution {
public:
    int maxSubArray(vector<int>& nums) {
        int best = nums[0], cur = nums[0];
        for (size_t i = 1; i < nums.size(); i++) {
            cur = max(nums[i], cur + nums[i]);
            best = max(best, cur);
        }
        return best;
    }
};
`,
  twoSum: r`class Solution {
public:
    vector<int> twoSum(vector<int>& numbers, int target) {
        int i = 0, j = (int)numbers.size() - 1;
        while (i < j) {
            int s = numbers[i] + numbers[j];
            if (s == target) return {i + 1, j + 1};
            if (s < target) i++; else j--;
        }
        return {};
    }
};
`,
  threeSum: r`class Solution {
public:
    vector<vector<int>> threeSum(vector<int>& nums) {
        sort(nums.begin(), nums.end());
        vector<vector<int>> out;
        int n = (int)nums.size();
        for (int i = 0; i < n - 2; i++) {
            if (i > 0 && nums[i] == nums[i - 1]) continue;
            int l = i + 1, h = n - 1;
            while (l < h) {
                int s = nums[i] + nums[l] + nums[h];
                if (s == 0) {
                    out.push_back({nums[h], nums[l], nums[i]});
                    while (l < h && nums[l] == nums[l + 1]) l++;
                    while (l < h && nums[h] == nums[h - 1]) h--;
                    l++; h--;
                } else if (s < 0) l++; else h--;
            }
        }
        reverse(out.begin(), out.end());
        return out;
    }
};
`,
  rangeSum: r`class Solution {
public:
    vector<int> rangeSum(vector<int>& nums, vector<vector<int>>& queries) {
        vector<int> prefix(nums.size() + 1, 0);
        for (size_t i = 0; i < nums.size(); i++) prefix[i + 1] = prefix[i] + nums[i];
        vector<int> out;
        for (auto& q : queries) out.push_back(prefix[q[1] + 1] - prefix[q[0]]);
        return out;
    }
};
`,
  subarraySum: r`class Solution {
public:
    int subarraySum(vector<int>& nums, int k) {
        unordered_map<int, int> seen;
        seen[0] = 1;
        int sum = 0, count = 0;
        for (int x : nums) {
            sum += x;
            auto it = seen.find(sum - k);
            if (it != seen.end()) count += it->second;
            seen[sum]++;
        }
        return count;
    }
};
`,
  containsDuplicate: r`class Solution {
public:
    bool containsDuplicate(vector<int>& nums) {
        unordered_set<int> seen;
        for (int x : nums) if (!seen.insert(x).second) return true;
        return false;
    }
};
`,
  mergeSortedArrays: r`class Solution {
public:
    vector<int> mergeSortedArrays(vector<int>& a, vector<int>& b) {
        vector<int> out(a.size() + b.size());
        merge(a.begin(), a.end(), b.begin(), b.end(), out.begin());
        return out;
    }
};
`,
  transpose: r`class Solution {
public:
    vector<vector<int>> transpose(vector<vector<int>>& matrix) {
        vector<vector<int>> out(matrix[0].size(), vector<int>(matrix.size()));
        for (size_t i = 0; i < matrix.size(); i++)
            for (size_t j = 0; j < matrix[0].size(); j++) out[j][i] = matrix[i][j];
        return out;
    }
};
`,
  isPalindrome: r`class Solution {
public:
    bool isPalindrome(string s) {
        int i = 0, j = (int)s.size() - 1;
        while (i < j) {
            if (!isalnum((unsigned char)s[i])) { i++; continue; }
            if (!isalnum((unsigned char)s[j])) { j--; continue; }
            if (tolower((unsigned char)s[i]) != tolower((unsigned char)s[j])) return false;
            i++; j--;
        }
        return true;
    }
};
`,
  reverseWords: r`class Solution {
public:
    string reverseWords(string s) {
        vector<string> words;
        string cur;
        for (char c : s) {
            if (c == ' ') { if (!cur.empty()) { words.push_back(cur); cur.clear(); } }
            else cur += c;
        }
        if (!cur.empty()) words.push_back(cur);
        string out;
        for (int i = (int)words.size() - 1; i >= 0; i--) {
            out += words[i];
            if (i > 0) out += ' ';
        }
        return out;
    }
};
`,
  isAnagram: r`class Solution {
public:
    bool isAnagram(string s, string t) {
        if (s.size() != t.size()) return false;
        int count[128] = {0};
        for (char c : s) count[(unsigned char)c]++;
        for (char c : t) if (--count[(unsigned char)c] < 0) return false;
        return true;
    }
};
`,
  groupAnagrams: r`class Solution {
public:
    vector<vector<string>> groupAnagrams(vector<string>& strs) {
        unordered_map<string, vector<string>> groups;
        for (auto& w : strs) {
            string key = w;
            sort(key.begin(), key.end());
            groups[key].push_back(w);
        }
        vector<vector<string>> out;
        for (auto& g : groups) out.push_back(g.second);
        return out;
    }
};
`,
  lengthOfLongestSubstring: r`class Solution {
public:
    int lengthOfLongestSubstring(string s) {
        vector<int> last(128, -1);
        int start = 0, best = 0;
        for (int i = 0; i < (int)s.size(); i++) {
            unsigned char c = s[i];
            if (last[c] >= start) start = last[c] + 1;
            last[c] = i;
            best = max(best, i - start + 1);
        }
        return best;
    }
};
`,
  minWindow: r`class Solution {
public:
    string minWindow(string s, string t) {
        vector<int> need(128, 0);
        for (char c : t) need[(unsigned char)c]++;
        int missing = (int)t.size(), bestStart = 0, bestLen = INT_MAX, l = 0;
        for (int h = 0; h < (int)s.size(); h++) {
            if (need[(unsigned char)s[h]]-- > 0) missing--;
            while (missing == 0) {
                if (h - l + 1 < bestLen) { bestLen = h - l + 1; bestStart = l; }
                if (++need[(unsigned char)s[l]] > 0) missing++;
                l++;
            }
        }
        return bestLen == INT_MAX ? "" : s.substr(bestStart, bestLen);
    }
};
`,
};

// ── The questions ───────────────────────────────────────────────────────────

const INT_ARR = (name) => ({ name, type: "int[]" });
const INT = (name) => ({ name, type: "int" });
const STR = (name) => ({ name, type: "string" });

/** Day N is DAYS[N - 1]: [question 1, question 2]. */
export const DAYS = [
  // Day 1 ─ Array fundamentals
  [
    {
      title: "Largest and Second Largest Element",
      difficulty: "Easy",
      tags: ["array"],
      fn: "largestTwo",
      params: [INT_ARR("arr")],
      ret: "int[]",
      ref: largestTwo,
      statement: md(
        `Given an array of positive integers \`arr\`, return \`[largest, secondLargest]\`.

The **second largest** is the largest value that is **strictly smaller** than the largest. If no such value exists (all elements are equal, or there is only one), use \`-1\` for it.

Try to do it in a single pass without sorting.`,
        ["`1 <= arr.length <= 100000`", "`1 <= arr[i] <= 100000`"],
      ),
      py: `class Solution:
    def largestTwo(self, arr: List[int]) -> List[int]:
        a, b = -1, -1
        for x in arr:
            if x > a:
                a, b = x, a
            elif x < a and x > b:
                b = x
        return [a, b]
`,
      samples: [
        { args: [[12, 35, 1, 10, 34, 1]], explanation: "35 is the largest; 34 is the largest value smaller than 35." },
        { args: [[10, 10, 10]], explanation: "Every element is 10, so there is no second largest." },
      ],
      hidden: [
        [Array(20000).fill(999)],
        [[...Array.from({ length: 19999 }, (_, i) => (i % 2 === 0 ? 100000 : 1)), 99999]],
      ],
    },
    {
      title: "Maximum Subarray (Kadane's Algorithm)",
      difficulty: "Medium",
      tags: ["array", "dynamic-programming"],
      fn: "maxSubArray",
      params: [INT_ARR("nums")],
      ret: "int",
      ref: maxSubArray,
      statement: md(
        `Given an integer array \`nums\`, find the contiguous subarray (containing at least one number) that has the largest sum, and return that sum.

A brute force over every subarray is too slow for the hidden tests. Aim for one pass.`,
        ["`1 <= nums.length <= 100000`", "`-10000 <= nums[i] <= 10000`"],
      ),
      py: `class Solution:
    def maxSubArray(self, nums: List[int]) -> int:
        best = cur = nums[0]
        for x in nums[1:]:
            cur = max(x, cur + x)
            best = max(best, cur)
        return best
`,
      samples: [
        { args: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], explanation: "The subarray [4,-1,2,1] has the largest sum, 6." },
        { args: [[-3, -1, -2]], explanation: "All numbers are negative, so the best subarray is the single element -1." },
      ],
      hidden: [[ints(rng(102), 20000, -1000, -1)], [ints(rng(103), 20000, -1000, 1000)]],
    },
  ],
  // Day 2 ─ Traversal and frequency
  [
    {
      title: "Remove Duplicates from Sorted Array",
      difficulty: "Easy",
      tags: ["array", "two-pointers"],
      fn: "removeDuplicates",
      params: [INT_ARR("nums")],
      ret: "int[]",
      ref: removeDuplicates,
      statement: md(
        `Given an integer array \`nums\` sorted in non-decreasing order, return an array that contains each distinct value exactly once, in the same order.

The classic version asks you to do this in place with two pointers. Here you return the resulting array, but the same idea applies.`,
        ["`1 <= nums.length <= 100000`", "`-10000 <= nums[i] <= 10000`", "`nums` is sorted in non-decreasing order."],
      ),
      py: `class Solution:
    def removeDuplicates(self, nums: List[int]) -> List[int]:
        out = []
        for x in nums:
            if not out or out[-1] != x:
                out.append(x)
        return out
`,
      samples: [
        { args: [[1, 1, 2]], explanation: "1 appears twice and is kept once." },
        { args: [[0, 0, 1, 1, 1, 2, 2, 3, 3, 4]], explanation: "Five distinct values remain, in their original order." },
      ],
      hidden: [[ints(rng(201), 20000, -500, 500).sort(asc)], [Array(20000).fill(42)]],
    },
    {
      title: "Majority Element",
      difficulty: "Medium",
      tags: ["array", "hash-map"],
      fn: "majorityElement",
      params: [INT_ARR("nums")],
      ret: "int",
      ref: majorityElement,
      statement: md(
        `Given an array \`nums\` of size \`n\`, return the majority element.

The majority element is the one that appears **more than** \`n / 2\` times. It is guaranteed to exist.

Can you solve it in linear time and constant extra space?`,
        ["`1 <= nums.length <= 100000`", "`-1000000 <= nums[i] <= 1000000`", "A majority element always exists."],
      ),
      py: `class Solution:
    def majorityElement(self, nums: List[int]) -> int:
        candidate, count = 0, 0
        for x in nums:
            if count == 0:
                candidate = x
            count += 1 if x == candidate else -1
        return candidate
`,
      samples: [
        { args: [[3, 2, 3]], explanation: "3 appears twice out of three elements." },
        { args: [[2, 2, 1, 1, 1, 2, 2]], explanation: "2 appears four times out of seven." },
      ],
      hidden: [
        [Array.from({ length: 19999 }, (_, i) => (i % 2 === 0 ? 7 : 1000 + i))],
        [[...Array.from({ length: 10000 }, (_, i) => -1000 - i), ...Array(10001).fill(-3)]],
      ],
    },
  ],
  // Day 3 ─ Two pointers
  [
    {
      title: "Move Zeroes",
      difficulty: "Easy",
      tags: ["array", "two-pointers"],
      fn: "moveZeroes",
      params: [INT_ARR("nums")],
      ret: "int[]",
      ref: moveZeroes,
      statement: md(
        `Given an integer array \`nums\`, move all \`0\`s to the end while keeping the relative order of the non-zero elements. Return the resulting array.`,
        ["`1 <= nums.length <= 100000`", "`-100000 <= nums[i] <= 100000`"],
      ),
      py: `class Solution:
    def moveZeroes(self, nums: List[int]) -> List[int]:
        out = [x for x in nums if x != 0]
        return out + [0] * (len(nums) - len(out))
`,
      samples: [
        { args: [[0, 1, 0, 3, 12]], explanation: "1, 3 and 12 keep their order; both zeroes move to the end." },
        { args: [[4, 0, -2, 0, 0, 7]], explanation: "Negative numbers are not zero, so -2 stays in order with 4 and 7." },
      ],
      hidden: [
        [(() => { const rand = rng(301); return Array.from({ length: 20000 }, () => (rand() < 0.7 ? 0 : ri(rand, -99, 99))); })()],
        [[...Array(19999).fill(0), 5]],
      ],
    },
    {
      title: "Container With Most Water",
      difficulty: "Medium",
      tags: ["array", "two-pointers", "greedy"],
      fn: "maxArea",
      params: [INT_ARR("height")],
      ret: "int",
      ref: maxArea,
      statement: md(
        `You are given an integer array \`height\`. There are vertical lines drawn so that the two endpoints of line \`i\` are \`(i, 0)\` and \`(i, height[i])\`.

Find two lines that, together with the x-axis, form a container holding the most water. Return the maximum amount of water it can store. The container cannot be slanted.

Checking every pair is too slow for the hidden tests.`,
        ["`2 <= height.length <= 100000`", "`0 <= height[i] <= 10000`"],
      ),
      py: `class Solution:
    def maxArea(self, height: List[int]) -> int:
        i, j, best = 0, len(height) - 1, 0
        while i < j:
            best = max(best, min(height[i], height[j]) * (j - i))
            if height[i] < height[j]:
                i += 1
            else:
                j -= 1
        return best
`,
      samples: [
        { args: [[1, 8, 6, 2, 5, 4, 8, 3, 7]], explanation: "Lines of height 8 (index 1) and 7 (index 8) are 7 apart: min(8,7) * 7 = 49." },
        { args: [[1, 1]], explanation: "The only pair is 1 apart with height 1." },
      ],
      hidden: [[ints(rng(302), 20000, 0, 10000)], [Array.from({ length: 20000 }, (_, i) => (i % 10000) + 1)]],
    },
  ],
  // Day 4 ─ Two pointers
  [
    {
      title: "Two Sum II (Sorted Array)",
      difficulty: "Easy",
      tags: ["array", "two-pointers"],
      fn: "twoSum",
      params: [INT_ARR("numbers"), INT("target")],
      ret: "int[]",
      ref: twoSum,
      java: JAVA.twoSum,
      cpp: CPP.twoSum,
      statement: md(
        `Given an array \`numbers\` sorted in non-decreasing order, find the two numbers that add up to \`target\`.

Return their positions as \`[index1, index2]\`, **1-indexed**, with \`index1 < index2\`. Exactly one solution exists, and you may not use the same element twice.`,
        ["`2 <= numbers.length <= 100000`", "`-100000 <= numbers[i] <= 100000`", "`numbers` is sorted in non-decreasing order.", "Exactly one solution exists."],
      ),
      py: `class Solution:
    def twoSum(self, numbers: List[int], target: int) -> List[int]:
        i, j = 0, len(numbers) - 1
        while i < j:
            s = numbers[i] + numbers[j]
            if s == target:
                return [i + 1, j + 1]
            if s < target:
                i += 1
            else:
                j -= 1
        return []
`,
      samples: [
        { args: [[2, 7, 11, 15], 9], explanation: "2 + 7 = 9. They are at positions 1 and 2." },
        { args: [[2, 3, 4], 6], explanation: "2 + 4 = 6. They are at positions 1 and 3." },
      ],
      hidden: [twoSumCase(0, 14999), twoSumCase(7499, 7500)],
    },
    {
      title: "3Sum",
      difficulty: "Medium",
      tags: ["array", "two-pointers", "sorting"],
      fn: "threeSum",
      params: [INT_ARR("nums")],
      ret: "intlists",
      sortOutput: true,
      timeLimitSec: 3,
      ref: threeSum,
      java: JAVA.threeSum,
      cpp: CPP.threeSum,
      statement: md(
        `Given an integer array \`nums\`, return all the triplets \`[nums[i], nums[j], nums[k]]\` such that \`i\`, \`j\` and \`k\` are distinct indices and the three values sum to \`0\`.

The result must not contain duplicate triplets. You may return the triplets, and the numbers inside each triplet, in any order.`,
        ["`3 <= nums.length <= 1000`", "`-10000 <= nums[i] <= 10000`"],
      ),
      py: `class Solution:
    def threeSum(self, nums: List[int]) -> List[List[int]]:
        a = sorted(nums)
        out = []
        n = len(a)
        for i in range(n - 2):
            if i > 0 and a[i] == a[i - 1]:
                continue
            l, h = i + 1, n - 1
            while l < h:
                s = a[i] + a[l] + a[h]
                if s == 0:
                    out.append([a[i], a[l], a[h]])
                    while l < h and a[l] == a[l + 1]:
                        l += 1
                    while l < h and a[h] == a[h - 1]:
                        h -= 1
                    l += 1
                    h -= 1
                elif s < 0:
                    l += 1
                else:
                    h -= 1
        return out
`,
      samples: [
        { args: [[-1, 0, 1, 2, -1, -4]], explanation: "Two distinct triplets sum to zero. [-1,0,1] can be formed two ways but is listed once." },
        { args: [[0, 0, 0]], explanation: "The only triplet is three zeroes." },
      ],
      hidden: [[ints(rng(401), 900, -10000, 10000)], [ints(rng(402), 1000, -20, 20)]],
    },
  ],
  // Day 5 ─ Prefix sum
  [
    {
      title: "Range Sum Queries",
      difficulty: "Easy",
      tags: ["array", "prefix-sum"],
      fn: "rangeSum",
      params: [INT_ARR("nums"), { name: "queries", type: "int[][]" }],
      ret: "int[]",
      ref: rangeSum,
      java: JAVA.rangeSum,
      cpp: CPP.rangeSum,
      statement: md(
        `You are given an integer array \`nums\` and a list of \`queries\`, where \`queries[i] = [left, right]\`.

For each query, compute the sum of \`nums[left..right]\` **inclusive** (0-indexed). Return the answers in order.

Summing each range separately is too slow for the hidden tests. Precompute prefix sums.`,
        ["`1 <= nums.length <= 100000`", "`-1000 <= nums[i] <= 1000`", "`1 <= queries.length <= 100000`", "`0 <= left <= right < nums.length`"],
      ),
      py: `class Solution:
    def rangeSum(self, nums: List[int], queries: List[List[int]]) -> List[int]:
        prefix = [0]
        for x in nums:
            prefix.append(prefix[-1] + x)
        return [prefix[h + 1] - prefix[l] for l, h in queries]
`,
      samples: [
        { args: [[-2, 0, 3, -5, 2, -1], [[0, 2], [2, 5], [0, 5]]], explanation: "(-2+0+3) = 1, (3-5+2-1) = -1, and the whole array sums to -3." },
        { args: [[1, 2, 3, 4], [[1, 2], [0, 3], [3, 3]]], explanation: "2+3 = 5, 1+2+3+4 = 10, and the single element at index 3 is 4." },
      ],
      hidden: [
        (() => {
          const rand = rng(501);
          const nums = ints(rand, 10000, 0, 99);
          const queries = Array.from({ length: 4000 }, () => {
            const a = ri(rand, 0, 9999);
            const b = ri(rand, 0, 9999);
            return [Math.min(a, b), Math.max(a, b)];
          });
          queries[0] = [0, 9999];
          return [nums, queries];
        })(),
        (() => {
          const rand = rng(502);
          const nums = ints(rand, 10000, -99, 99);
          const queries = Array.from({ length: 4000 }, (_, i) => {
            if (i % 2 === 0) {
              const a = ri(rand, 0, 9999);
              return [a, a];
            }
            return [ri(rand, 0, 100), ri(rand, 9900, 9999)];
          });
          return [nums, queries];
        })(),
      ],
    },
    {
      title: "Subarray Sum Equals K",
      difficulty: "Medium",
      tags: ["array", "prefix-sum", "hash-map"],
      fn: "subarraySum",
      params: [INT_ARR("nums"), INT("k")],
      ret: "int",
      ref: subarraySum,
      java: JAVA.subarraySum,
      cpp: CPP.subarraySum,
      statement: md(
        `Given an integer array \`nums\` and an integer \`k\`, return the total number of contiguous subarrays whose sum equals \`k\`.

The array may contain negative numbers and zeroes, so a sliding window does not work. Think prefix sums with a hash map.`,
        ["`1 <= nums.length <= 20000`", "`-1000 <= nums[i] <= 1000`", "`-10000000 <= k <= 10000000`", "The answer fits in a 32-bit signed integer."],
      ),
      py: `class Solution:
    def subarraySum(self, nums: List[int], k: int) -> int:
        seen = {0: 1}
        total = count = 0
        for x in nums:
            total += x
            count += seen.get(total - k, 0)
            seen[total] = seen.get(total, 0) + 1
        return count
`,
      samples: [
        { args: [[1, 1, 1], 2], explanation: "The subarrays [1,1] starting at index 0 and at index 1 both sum to 2." },
        { args: [[1, 2, 3], 3], explanation: "[1,2] and [3] both sum to 3." },
      ],
      hidden: [[Array(20000).fill(0), 0], [ints(rng(503), 20000, -5, 5), 7]],
    },
  ],
  // Day 6 ─ Hashing
  [
    {
      title: "Contains Duplicate",
      difficulty: "Easy",
      tags: ["array", "hash-set"],
      fn: "containsDuplicate",
      params: [INT_ARR("nums")],
      ret: "bool",
      ref: containsDuplicate,
      java: JAVA.containsDuplicate,
      cpp: CPP.containsDuplicate,
      statement: md(
        `Given an integer array \`nums\`, return \`true\` if any value appears at least twice, and \`false\` if every element is distinct.`,
        ["`1 <= nums.length <= 100000`", "`-1000000 <= nums[i] <= 1000000`"],
      ),
      py: `class Solution:
    def containsDuplicate(self, nums: List[int]) -> bool:
        return len(set(nums)) != len(nums)
`,
      samples: [
        { args: [[1, 2, 3, 1]], explanation: "1 appears at index 0 and index 3." },
        { args: [[1, 2, 3, 4]], explanation: "All four values are different." },
      ],
      hidden: [
        [shuffle(rng(601), Array.from({ length: 14000 }, (_, i) => i * 3 - 21000))],
        [(() => { const a = shuffle(rng(602), Array.from({ length: 14000 }, (_, i) => i * 3 - 21000)); a[13999] = a[0]; return a; })()],
      ],
    },
    {
      title: "Longest Consecutive Sequence",
      difficulty: "Medium",
      tags: ["array", "hash-set"],
      fn: "longestConsecutive",
      params: [INT_ARR("nums")],
      ret: "int",
      ref: longestConsecutive,
      statement: md(
        `Given an unsorted integer array \`nums\`, return the length of the longest sequence of consecutive integers that can be formed from its values.

The elements do not need to be adjacent in the array, and duplicates count once. Aim for an \`O(n)\` solution.`,
        ["`0 <= nums.length <= 100000`", "`-1000000 <= nums[i] <= 1000000`"],
      ),
      py: `class Solution:
    def longestConsecutive(self, nums: List[int]) -> int:
        values = set(nums)
        best = 0
        for x in values:
            if x - 1 in values:
                continue
            length = 1
            while x + length in values:
                length += 1
            best = max(best, length)
        return best
`,
      samples: [
        { args: [[100, 4, 200, 1, 3, 2]], explanation: "The longest run is 1, 2, 3, 4." },
        { args: [[0, 3, 7, 2, 5, 8, 4, 6, 0, 1]], explanation: "0 through 8 are all present. The duplicate 0 counts once." },
      ],
      hidden: [
        [(() => {
          const rand = rng(603);
          const run = Array.from({ length: 12000 }, (_, i) => i - 3000);
          const far = Array.from({ length: 4000 }, (_, i) => 20000 + 3 * i);
          const dup = Array.from({ length: 3000 }, () => ri(rand, -3000, 8999));
          return shuffle(rand, [...run, ...far, ...dup]);
        })()],
        [(() => {
          const a = [];
          for (let g = 0; g < 3000; g++) {
            const len = g === 1234 ? 7 : 5;
            for (let i = 0; i < len; i++) a.push(g * 10 + i - 15000);
          }
          return shuffle(rng(604), a);
        })()],
      ],
    },
  ],
  // Day 7 ─ Sliding window
  [
    {
      title: "Maximum Sum Subarray of Size K",
      difficulty: "Easy",
      tags: ["array", "sliding-window"],
      fn: "maxSumSubarray",
      params: [INT_ARR("arr"), INT("k")],
      ret: "int",
      ref: maxSumSubarray,
      statement: md(
        `Given an integer array \`arr\` and an integer \`k\`, return the maximum sum of any contiguous subarray of **exactly** \`k\` elements.

Recomputing the sum of every window from scratch is too slow for the hidden tests. Slide the window instead.`,
        ["`1 <= k <= arr.length <= 100000`", "`-1000 <= arr[i] <= 1000`"],
      ),
      py: `class Solution:
    def maxSumSubarray(self, arr: List[int], k: int) -> int:
        window = sum(arr[:k])
        best = window
        for i in range(k, len(arr)):
            window += arr[i] - arr[i - k]
            best = max(best, window)
        return best
`,
      samples: [
        { args: [[2, 1, 5, 1, 3, 2], 3], explanation: "The window [5,1,3] has the largest sum, 9." },
        { args: [[-1, -2, -3, -4], 2], explanation: "Every window is negative. The best is [-1,-2] with sum -3." },
      ],
      hidden: [[ints(rng(701), 20000, -1000, 1000), 10000], [ints(rng(702), 20000, -1000, -1), 19999]],
    },
    {
      title: "Longest Subarray with Sum K",
      difficulty: "Medium",
      tags: ["array", "prefix-sum", "hash-map"],
      fn: "longestSubarrayWithSumK",
      params: [INT_ARR("arr"), INT("k")],
      ret: "int",
      ref: longestSubarrayWithSumK,
      statement: md(
        `Given an integer array \`arr\` and an integer \`k\`, return the length of the longest contiguous subarray whose sum equals \`k\`. Return \`0\` if there is none.

The array can contain negative numbers and zeroes, so a plain two-pointer window is not enough.`,
        ["`1 <= arr.length <= 100000`", "`-1000 <= arr[i] <= 1000`", "`-10000000 <= k <= 10000000`"],
      ),
      py: `class Solution:
    def longestSubarrayWithSumK(self, arr: List[int], k: int) -> int:
        first = {0: -1}
        total = best = 0
        for i, x in enumerate(arr):
            total += x
            if total - k in first:
                best = max(best, i - first[total - k])
            if total not in first:
                first[total] = i
        return best
`,
      samples: [
        { args: [[10, 5, 2, 7, 1, -10], 15], explanation: "The whole array sums to 15, so the answer is its length, 6." },
        { args: [[1, 2, 3], 7], explanation: "No contiguous subarray sums to 7." },
      ],
      hidden: [[ints(rng(703), 20000, -3, 3), 0], [ints(rng(704), 20000, -50, 50), 37]],
    },
  ],
  // Day 8 ─ Arrays, intermediate
  [
    {
      title: "Best Time to Buy and Sell Stock",
      difficulty: "Easy",
      tags: ["array", "greedy"],
      fn: "maxProfit",
      params: [INT_ARR("prices")],
      ret: "int",
      ref: maxProfit,
      statement: md(
        `You are given an array \`prices\` where \`prices[i]\` is the price of a stock on day \`i\`.

Choose one day to buy and a **later** day to sell. Return the maximum profit you can make. If no profit is possible, return \`0\`.`,
        ["`1 <= prices.length <= 100000`", "`0 <= prices[i] <= 100000`"],
      ),
      py: `class Solution:
    def maxProfit(self, prices: List[int]) -> int:
        low, best = prices[0], 0
        for p in prices:
            low = min(low, p)
            best = max(best, p - low)
        return best
`,
      samples: [
        { args: [[7, 1, 5, 3, 6, 4]], explanation: "Buy at 1 on day 1 and sell at 6 on day 4." },
        { args: [[7, 6, 4, 3, 1]], explanation: "Prices only fall, so no trade makes a profit." },
      ],
      hidden: [
        [Array.from({ length: 16000 }, (_, i) => 20000 - i)],
        [(() => { const a = ints(rng(801), 20000, 100, 10000); a[0] = 20000; a[19999] = 0; return a; })()],
      ],
    },
    {
      title: "Product of Array Except Self",
      difficulty: "Medium",
      tags: ["array", "prefix-sum"],
      fn: "productExceptSelf",
      params: [INT_ARR("nums")],
      ret: "int[]",
      ref: productExceptSelf,
      statement: md(
        `Given an integer array \`nums\`, return an array \`answer\` where \`answer[i]\` is the product of all the elements of \`nums\` except \`nums[i]\`.

Solve it in \`O(n)\` **without using division**. The array may contain zeroes.`,
        ["`2 <= nums.length <= 100000`", "`-30 <= nums[i] <= 30`", "Every prefix and suffix product fits in a 32-bit signed integer."],
      ),
      py: `class Solution:
    def productExceptSelf(self, nums: List[int]) -> List[int]:
        n = len(nums)
        out = [1] * n
        left = 1
        for i in range(n):
            out[i] = left
            left *= nums[i]
        right = 1
        for i in range(n - 1, -1, -1):
            out[i] *= right
            right *= nums[i]
        return out
`,
      samples: [
        { args: [[1, 2, 3, 4]], explanation: "For index 0 the product is 2*3*4 = 24, for index 1 it is 1*3*4 = 12, and so on." },
        { args: [[-1, 1, 0, -3, 3]], explanation: "Only index 2 excludes the zero, giving (-1)*1*(-3)*3 = 9. Every other position includes it." },
      ],
      hidden: [
        [(() => { const rand = rng(802); const a = Array.from({ length: 18000 }, () => (rand() < 0.5 ? 1 : -1)); for (let i = 0; i < 5; i++) a[ri(rand, 0, 17999)] = 2; return a; })()],
        [(() => { const rand = rng(803); const a = Array.from({ length: 20000 }, () => (rand() < 0.5 ? 1 : -1)); for (let i = 0; i < 5; i++) a[ri(rand, 0, 12000)] = 3; a[12345] = 0; return a; })()],
      ],
    },
  ],
  // Day 9 ─ Sorting and intervals
  [
    {
      title: "Merge Two Sorted Arrays",
      difficulty: "Easy",
      tags: ["array", "two-pointers", "sorting"],
      fn: "mergeSortedArrays",
      params: [INT_ARR("a"), INT_ARR("b")],
      ret: "int[]",
      ref: mergeSortedArrays,
      java: JAVA.mergeSortedArrays,
      cpp: CPP.mergeSortedArrays,
      statement: md(
        `Given two integer arrays \`a\` and \`b\`, each sorted in non-decreasing order, return one array containing all the elements of both, also sorted in non-decreasing order.

Either array may be empty. Merge with two pointers in \`O(n + m)\` instead of sorting again.`,
        ["`0 <= a.length, b.length <= 100000`", "`a.length + b.length >= 1`", "`-100000 <= a[i], b[i] <= 100000`"],
      ),
      py: `class Solution:
    def mergeSortedArrays(self, a: List[int], b: List[int]) -> List[int]:
        out = []
        i = j = 0
        while i < len(a) and j < len(b):
            if a[i] <= b[j]:
                out.append(a[i])
                i += 1
            else:
                out.append(b[j])
                j += 1
        out.extend(a[i:])
        out.extend(b[j:])
        return out
`,
      samples: [
        { args: [[1, 3, 5], [2, 4, 6]], explanation: "The elements interleave perfectly." },
        { args: [[1, 2, 2], [2, 3]], explanation: "Duplicates are all kept: 2 appears three times." },
      ],
      hidden: [
        [ints(rng(901), 9000, -5000, 5000).sort(asc), ints(rng(902), 9000, -5000, 5000).sort(asc)],
        [[], ints(rng(903), 15000, -100000, 100000).sort(asc)],
      ],
    },
    {
      title: "Merge Intervals",
      difficulty: "Medium",
      tags: ["array", "sorting", "intervals"],
      fn: "mergeIntervals",
      params: [{ name: "intervals", type: "int[][]" }],
      ret: "int[][]",
      ref: mergeIntervals,
      statement: md(
        `Given an array of \`intervals\` where \`intervals[i] = [start, end]\`, merge all overlapping intervals.

Return the merged intervals **sorted by start**. Intervals that only touch, such as \`[1,4]\` and \`[4,5]\`, count as overlapping. The input is not sorted.`,
        ["`1 <= intervals.length <= 10000`", "`0 <= start <= end <= 1000000`"],
      ),
      py: `class Solution:
    def mergeIntervals(self, intervals: List[List[int]]) -> List[List[int]]:
        out = []
        for start, end in sorted(intervals):
            if out and start <= out[-1][1]:
                out[-1][1] = max(out[-1][1], end)
            else:
                out.append([start, end])
        return out
`,
      samples: [
        { args: [[[1, 3], [2, 6], [8, 10], [15, 18]]], explanation: "[1,3] and [2,6] overlap and become [1,6]. The other two stand alone." },
        { args: [[[1, 4], [4, 5]]], explanation: "The intervals touch at 4, so they merge into [1,5]." },
      ],
      hidden: [
        [(() => { const rand = rng(904); return Array.from({ length: 6000 }, () => { const s = ri(rand, 0, 100000); return [s, s + ri(rand, 0, 50)]; }); })()],
        [shuffle(rng(905), [...Array.from({ length: 6000 }, (_, i) => [i, i + 1]), [10000, 10005], [10005, 10010], [0, 2], [20000, 20000]])],
      ],
    },
  ],
  // Day 10 ─ Matrix
  [
    {
      title: "Transpose Matrix",
      difficulty: "Easy",
      tags: ["array", "matrix"],
      fn: "transpose",
      params: [{ name: "matrix", type: "int[][]" }],
      ret: "int[][]",
      ref: transpose,
      java: JAVA.transpose,
      cpp: CPP.transpose,
      statement: md(
        `Given a 2D integer array \`matrix\` with \`m\` rows and \`n\` columns, return its transpose.

The transpose flips the matrix over its main diagonal: row \`i\`, column \`j\` of the input becomes row \`j\`, column \`i\` of the output. The matrix is not necessarily square.`,
        ["`1 <= m, n <= 1000`", "`m * n <= 100000`", "`-1000 <= matrix[i][j] <= 1000`"],
      ),
      py: `class Solution:
    def transpose(self, matrix: List[List[int]]) -> List[List[int]]:
        return [list(col) for col in zip(*matrix)]
`,
      samples: [
        { args: [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]], explanation: "Rows become columns: the first row [1,2,3] is now the first column." },
        { args: [[[1, 2, 3], [4, 5, 6]]], explanation: "A 2 x 3 matrix becomes a 3 x 2 matrix." },
      ],
      hidden: [
        [(() => { const rand = rng(1001); return Array.from({ length: 60 }, () => ints(rand, 150, -999, 999)); })()],
        [[ints(rng(1002), 3000, -999, 999)]],
      ],
    },
    {
      title: "Set Matrix Zeroes",
      difficulty: "Medium",
      tags: ["array", "matrix"],
      fn: "setZeroes",
      params: [{ name: "matrix", type: "int[][]" }],
      ret: "int[][]",
      ref: setZeroes,
      statement: md(
        `Given an \`m x n\` integer \`matrix\`, if an element is \`0\`, set its entire row and column to \`0\`. Return the resulting matrix.

Only the zeroes present in the **original** matrix count. A zero you write must not cause more rows or columns to be cleared.`,
        ["`1 <= m, n <= 200`", "`-1000 <= matrix[i][j] <= 1000`"],
      ),
      py: `class Solution:
    def setZeroes(self, matrix: List[List[int]]) -> List[List[int]]:
        rows = {i for i, row in enumerate(matrix) if 0 in row}
        cols = {j for row in matrix for j, v in enumerate(row) if v == 0}
        return [
            [0 if i in rows or j in cols else v for j, v in enumerate(row)]
            for i, row in enumerate(matrix)
        ]
`,
      samples: [
        { args: [[[1, 1, 1], [1, 0, 1], [1, 1, 1]]], explanation: "The zero in the centre clears the middle row and the middle column." },
        { args: [[[0, 1, 2, 0], [3, 4, 5, 2], [1, 3, 1, 5]]], explanation: "The zeroes at the two top corners clear the first row and the first and last columns." },
      ],
      hidden: [
        [(() => { const rand = rng(1003); const m = Array.from({ length: 100 }, () => ints(rand, 100, 1, 9)); for (let i = 0; i < 15; i++) m[ri(rand, 0, 99)][ri(rand, 0, 99)] = 0; return m; })()],
        [(() => { const rand = rng(1004); const m = Array.from({ length: 80 }, () => ints(rand, 120, 1, 9)); m[0][0] = 0; m[79][119] = 0; return m; })()],
      ],
    },
  ],
  // Day 11 ─ String fundamentals
  [
    {
      title: "Valid Palindrome",
      difficulty: "Easy",
      tags: ["string", "two-pointers"],
      fn: "isPalindrome",
      params: [STR("s")],
      ret: "bool",
      ref: isPalindrome,
      java: JAVA.isPalindrome,
      cpp: CPP.isPalindrome,
      statement: md(
        `A phrase is a palindrome if, after converting all uppercase letters to lowercase and removing every character that is not a letter or a digit, it reads the same forward and backward.

Given a string \`s\`, return \`true\` if it is a palindrome and \`false\` otherwise.`,
        ["`1 <= s.length <= 200000`", "`s` consists of English letters, digits, spaces and the punctuation `, . : ; ! ? -`"],
      ),
      py: `class Solution:
    def isPalindrome(self, s: str) -> bool:
        i, j = 0, len(s) - 1
        while i < j:
            if not s[i].isalnum():
                i += 1
            elif not s[j].isalnum():
                j -= 1
            elif s[i].lower() != s[j].lower():
                return False
            else:
                i += 1
                j -= 1
        return True
`,
      samples: [
        { args: ["A man, a plan, a canal: Panama"], explanation: "Cleaned up it reads amanaplanacanalpanama, which is the same both ways." },
        { args: ["race a car"], explanation: "Cleaned up it reads raceacar, which is not the same backward." },
      ],
      hidden: [validPalindromeCase(1101, false), validPalindromeCase(1102, true)],
    },
    {
      title: "Longest Palindromic Substring",
      difficulty: "Medium",
      tags: ["string", "two-pointers", "dynamic-programming"],
      fn: "longestPalindrome",
      params: [STR("s")],
      ret: "string",
      timeLimitSec: 3,
      ref: longestPalindrome,
      statement: md(
        `Given a string \`s\`, return the longest substring of \`s\` that is a palindrome.

In every test the longest palindromic substring is unique, so there is exactly one correct answer.`,
        ["`1 <= s.length <= 1000`", "`s` consists of lowercase English letters.", "The longest palindromic substring is unique."],
      ),
      py: `class Solution:
    def longestPalindrome(self, s: str) -> str:
        start, length = 0, 1 if s else 0

        def grow(l: int, h: int) -> None:
            nonlocal start, length
            while l >= 0 and h < len(s) and s[l] == s[h]:
                l -= 1
                h += 1
            if h - l - 1 > length:
                start, length = l + 1, h - l - 1

        for i in range(len(s)):
            grow(i, i)
            grow(i, i + 1)
        return s[start:start + length]
`,
      samples: [
        { args: ["cbbd"], explanation: "bb is the only palindrome longer than one character." },
        { args: ["forgeeksskeegfor"], explanation: "geeksskeeg reads the same both ways and nothing longer does." },
      ],
      hidden: [palindromeCase(1103, 150, "middle", false), palindromeCase(1104, 140, "end", true)],
    },
  ],
  // Day 12 ─ String hashing and frequency
  [
    {
      title: "Valid Anagram",
      difficulty: "Easy",
      tags: ["string", "hash-map", "sorting"],
      fn: "isAnagram",
      params: [STR("s"), STR("t")],
      ret: "bool",
      ref: isAnagram,
      java: JAVA.isAnagram,
      cpp: CPP.isAnagram,
      statement: md(
        `Given two strings \`s\` and \`t\`, return \`true\` if \`t\` is an anagram of \`s\`, and \`false\` otherwise.

An anagram uses exactly the same letters the same number of times, in any order.`,
        ["`1 <= s.length, t.length <= 100000`", "`s` and `t` consist of lowercase English letters."],
      ),
      py: `class Solution:
    def isAnagram(self, s: str, t: str) -> bool:
        if len(s) != len(t):
            return False
        count = {}
        for c in s:
            count[c] = count.get(c, 0) + 1
        for c in t:
            if count.get(c, 0) == 0:
                return False
            count[c] -= 1
        return True
`,
      samples: [
        { args: ["anagram", "nagaram"], explanation: "Both use three a's and one each of n, g, r and m." },
        { args: ["rat", "car"], explanation: "rat has a t that car does not have." },
      ],
      hidden: [
        (() => { const rand = rng(1201); const s = chars(rand, 40000, LOWER); return [s, shuffle(rand, [...s]).join("")]; })(),
        (() => { const rand = rng(1202); const s = chars(rand, 40000, LOWER); const t = shuffle(rand, [...s]); t[20000] = t[20000] === "a" ? "b" : "a"; return [s, t.join("")]; })(),
      ],
    },
    {
      title: "Group Anagrams",
      difficulty: "Medium",
      tags: ["string", "hash-map", "sorting"],
      fn: "groupAnagrams",
      params: [{ name: "strs", type: "string[]" }],
      ret: "string[][]",
      sortOutput: true,
      ref: groupAnagrams,
      java: JAVA.groupAnagrams,
      cpp: CPP.groupAnagrams,
      statement: md(
        `Given an array of strings \`strs\`, group the anagrams together.

You may return the groups, and the words inside each group, in any order. If the same word appears more than once in the input, keep every copy.`,
        ["`1 <= strs.length <= 10000`", "`1 <= strs[i].length <= 100`", "`strs[i]` consists of lowercase English letters."],
      ),
      py: `class Solution:
    def groupAnagrams(self, strs: List[str]) -> List[List[str]]:
        groups = {}
        for word in strs:
            groups.setdefault("".join(sorted(word)), []).append(word)
        return list(groups.values())
`,
      samples: [
        { args: [["eat", "tea", "tan", "ate", "nat", "bat"]], explanation: "eat, tea and ate share letters; tan and nat share letters; bat is on its own." },
        { args: [["abc", "bca", "xyz", "zyx", "cab"]], explanation: "Three words are rearrangements of abc and two of xyz." },
      ],
      hidden: [
        [(() => { const rand = rng(1203); return Array.from({ length: 3000 }, () => chars(rand, ri(rand, 2, 5), "abcd")); })()],
        [(() => { const rand = rng(1204); const base = Array.from({ length: 40 }, () => chars(rand, 20, LOWER)); return Array.from({ length: 1500 }, () => shuffle(rand, [...base[ri(rand, 0, 39)]]).join("")); })()],
      ],
    },
  ],
  // Day 13 ─ String sliding window
  [
    {
      title: "Longest Substring Without Repeating Characters",
      difficulty: "Medium",
      tags: ["string", "sliding-window", "hash-map"],
      fn: "lengthOfLongestSubstring",
      params: [STR("s")],
      ret: "int",
      ref: lengthOfLongestSubstring,
      java: JAVA.lengthOfLongestSubstring,
      cpp: CPP.lengthOfLongestSubstring,
      statement: md(
        `Given a string \`s\`, find the length of the longest **substring** that contains no repeated character.

A substring is a contiguous block of characters.`,
        ["`1 <= s.length <= 100000`", "`s` consists of lowercase English letters and digits."],
      ),
      py: `class Solution:
    def lengthOfLongestSubstring(self, s: str) -> int:
        last = {}
        start = best = 0
        for i, c in enumerate(s):
            if c in last and last[c] >= start:
                start = last[c] + 1
            last[c] = i
            best = max(best, i - start + 1)
        return best
`,
      samples: [
        { args: ["abcabcbb"], explanation: "abc has length 3. Any longer window repeats a letter." },
        { args: ["bbbbb"], explanation: "Every window longer than one character repeats b." },
      ],
      hidden: [[chars(rng(1301), 50000, LOWER + "0123456789")], [(LOWER + "0123456789").repeat(1388)]],
    },
    {
      title: "Minimum Window Substring",
      difficulty: "Hard",
      tags: ["string", "sliding-window", "hash-map"],
      fn: "minWindow",
      params: [STR("s"), STR("t")],
      ret: "string",
      ref: minWindow,
      java: JAVA.minWindow,
      cpp: CPP.minWindow,
      statement: md(
        `Given two strings \`s\` and \`t\`, return the shortest substring of \`s\` that contains every character of \`t\`, **including duplicates**. If there is no such substring, return the empty string \`""\`.

In every test the shortest window, when one exists, is unique.`,
        ["`1 <= s.length, t.length <= 100000`", "`s` and `t` consist of uppercase and lowercase English letters.", "The answer is unique."],
      ),
      py: `class Solution:
    def minWindow(self, s: str, t: str) -> str:
        need = {}
        for c in t:
            need[c] = need.get(c, 0) + 1
        missing = len(t)
        best_start, best_len = 0, len(s) + 1
        l = 0
        for h, c in enumerate(s):
            if need.get(c, 0) > 0:
                missing -= 1
            need[c] = need.get(c, 0) - 1
            while missing == 0:
                if h - l + 1 < best_len:
                    best_start, best_len = l, h - l + 1
                d = s[l]
                need[d] += 1
                if need[d] > 0:
                    missing += 1
                l += 1
        return "" if best_len > len(s) else s[best_start:best_start + best_len]
`,
      samples: [
        { args: ["ADOBECODEBANC", "ABC"], explanation: "BANC is the shortest window that contains A, B and C." },
        { args: ["a", "aa"], explanation: "t needs two a's but s has only one, so no window works." },
      ],
      hidden: [minWindowUnique(1302), noWindowCase(1303)],
    },
  ],
  // Day 14 ─ String manipulation
  [
    {
      title: "Reverse Words in a String",
      difficulty: "Easy",
      tags: ["string", "two-pointers"],
      fn: "reverseWords",
      params: [STR("s")],
      ret: "string",
      ref: reverseWords,
      java: JAVA.reverseWords,
      cpp: CPP.reverseWords,
      statement: md(
        `Given a string \`s\`, reverse the order of the **words**.

A word is a sequence of non-space characters. The input may have leading or trailing spaces and several spaces between words. The returned string must have the words separated by a **single** space, with no leading or trailing spaces.`,
        ["`1 <= s.length <= 100000`", "`s` consists of lowercase English letters and spaces.", "`s` contains at least one word."],
      ),
      py: `class Solution:
    def reverseWords(self, s: str) -> str:
        return " ".join(reversed(s.split()))
`,
      samples: [
        { args: ["the sky is blue"], explanation: "The four words appear in the opposite order." },
        { args: ["  hello world  "], explanation: "The leading and trailing spaces are dropped." },
      ],
      hidden: [wordsCase(1401, 5000, 8, 4), wordsCase(1402, 8000, 1, 3)],
    },
    {
      title: "String Compression (Run-Length Encoding)",
      difficulty: "Medium",
      tags: ["string", "two-pointers"],
      fn: "compress",
      params: [STR("s")],
      ret: "string",
      ref: compress,
      statement: md(
        `Given a string \`s\`, compress it with run-length encoding and return the result.

Replace each group of consecutive identical characters with the character followed by the size of the group. If the group has size \`1\`, write only the character. Group sizes of 10 or more are written with all their digits, for example \`a12\`.`,
        ["`1 <= s.length <= 100000`", "`s` consists of lowercase English letters."],
      ),
      py: `class Solution:
    def compress(self, s: str) -> str:
        out = []
        i = 0
        while i < len(s):
            j = i
            while j < len(s) and s[j] == s[i]:
                j += 1
            out.append(s[i])
            if j - i > 1:
                out.append(str(j - i))
            i = j
        return "".join(out)
`,
      samples: [
        { args: ["aabcccccaaa"], explanation: "Two a's, one b, five c's, then three a's. The single b has no count." },
        { args: ["abc"], explanation: "Every group has size 1, so nothing changes." },
      ],
      hidden: [runsCase(1403), ["ab".repeat(25000)]],
    },
  ],
  // Day 15 ─ Mixed mastery
  [
    {
      title: "Rotate Array",
      difficulty: "Medium",
      tags: ["array", "two-pointers"],
      fn: "rotate",
      params: [INT_ARR("nums"), INT("k")],
      ret: "int[]",
      ref: rotate,
      statement: md(
        `Given an integer array \`nums\`, rotate it to the **right** by \`k\` steps and return the result.

One step moves the last element to the front. \`k\` can be much larger than the length of the array.`,
        ["`1 <= nums.length <= 100000`", "`-100000 <= nums[i] <= 100000`", "`0 <= k <= 2000000000`"],
      ),
      py: `class Solution:
    def rotate(self, nums: List[int], k: int) -> List[int]:
        k %= len(nums)
        return nums[-k:] + nums[:-k] if k else nums
`,
      samples: [
        { args: [[1, 2, 3, 4, 5, 6, 7], 3], explanation: "The last three elements 5, 6, 7 move to the front." },
        { args: [[-1, -100, 3, 99], 2], explanation: "After two steps 3 and 99 are at the front." },
      ],
      hidden: [[ints(rng(1501), 20000, -99, 99), 1000000007], [ints(rng(1502), 19997, -99, 99), 3 * 19997 + 1]],
    },
    {
      title: "Trapping Rain Water",
      difficulty: "Hard",
      tags: ["array", "two-pointers", "stack"],
      fn: "trap",
      params: [INT_ARR("height")],
      ret: "int",
      ref: trap,
      statement: md(
        `Given \`n\` non-negative integers representing an elevation map where the width of each bar is \`1\`, compute how much water it can trap after raining.

Water above a bar is limited by the tallest bar to its left and the tallest bar to its right.`,
        ["`1 <= height.length <= 100000`", "`0 <= height[i] <= 10000`", "The answer fits in a 32-bit signed integer."],
      ),
      py: `class Solution:
    def trap(self, height: List[int]) -> int:
        l, h = 0, len(height) - 1
        max_l = max_r = water = 0
        while l < h:
            if height[l] < height[h]:
                max_l = max(max_l, height[l])
                water += max_l - height[l]
                l += 1
            else:
                max_r = max(max_r, height[h])
                water += max_r - height[h]
                h -= 1
        return water
`,
      samples: [
        { args: [[0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]], explanation: "Six units of water collect in the dips between the taller bars." },
        { args: [[4, 2, 0, 3, 2, 5]], explanation: "Between the walls of height 4 and 5 the dips hold 2 + 4 + 1 + 2 = 9 units." },
      ],
      hidden: [
        [ints(rng(1503), 20000, 0, 10000)],
        [Array.from({ length: 20000 }, (_, i) => (i < 10000 ? 10000 - i : i - 9999))],
      ],
    },
  ],
];

// The two Day 1 questions also prove the (int[]) -> int[] and (int[]) -> int drivers.
DAYS[0][0].java = JAVA.largestTwo;
DAYS[0][0].cpp = CPP.largestTwo;
DAYS[0][1].java = JAVA.maxSubArray;
DAYS[0][1].cpp = CPP.maxSubArray;
