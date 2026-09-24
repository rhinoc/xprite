/** TinyExpr-compatible arithmetic (Lewis Van Winkle, zlib license), parsed
 * without eval/Function or global names. A malformed expression falls back to
 * its numeric prefix. Powers associate left and unary signs bind first. */
export function evaluateSizeExpression(text: string): number | null {
  if (text.length > 1024) return null;
  let offset = 0,
    depth = 0;
  const ws = () => {
    while (/\s/.test(text[offset] ?? "") && offset < text.length) offset++;
  };
  const take = (token: string) => {
    ws();
    if (text.startsWith(token, offset)) {
      offset += token.length;
      return true;
    }
    return false;
  };
  const factorial = (n: number) => {
    if (n < 0) return NaN;
    if (n > 170) return Infinity;
    let out = 1;
    for (let i = 2; i <= Math.trunc(n); i++) out *= i;
    return out;
  };
  const combination = (n: number, r: number) => {
    n = Math.trunc(n);
    r = Math.trunc(r);
    if (r < 0 || n < r || n < 0) return NaN;
    let out = 1;
    for (let i = 1; i <= Math.min(r, n - r); i++) out *= (n - i + 1) / i;
    return out;
  };
  const unary: Record<string, (n: number) => number> = {
    abs: Math.abs,
    acos: Math.acos,
    asin: Math.asin,
    atan: Math.atan,
    ceil: Math.ceil,
    cos: Math.cos,
    cosh: Math.cosh,
    exp: Math.exp,
    fac: factorial,
    floor: Math.floor,
    ln: Math.log,
    log: Math.log10,
    log10: Math.log10,
    sin: Math.sin,
    sinh: Math.sinh,
    sqrt: Math.sqrt,
    tan: Math.tan,
    tanh: Math.tanh,
  };
  const binary: Record<string, (a: number, b: number) => number> = {
    atan2: Math.atan2,
    pow: Math.pow,
    ncr: combination,
    npr: (n, r) => combination(n, r) * factorial(r),
  };
  const fail = () => {
    throw new Error("Invalid expression");
  };
  const base = (): number => {
    if (++depth > 64) fail();
    ws();
    let out: number;
    if (take("(")) {
      out = list();
      if (!take(")")) fail();
    } else {
      const numeric = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(offset));
      if (numeric) {
        offset += numeric[0].length;
        out = Number(numeric[0]);
      } else {
        const id = /^[a-z][a-z0-9_]*/.exec(text.slice(offset));
        if (!id) return fail();
        offset += id[0].length;
        const name = id[0];
        if (name === "pi" || name === "e") {
          out = name === "pi" ? Math.PI : Math.E;
          if (take("(") && !take(")")) fail();
        } else if (Object.prototype.hasOwnProperty.call(unary, name)) out = unary[name](signed());
        else if (Object.prototype.hasOwnProperty.call(binary, name)) {
          if (!take("(")) fail();
          const a = sum();
          if (!take(",")) fail();
          const b = sum();
          if (!take(")")) fail();
          out = binary[name](a, b);
        } else return fail();
      }
    }
    depth--;
    return out;
  };
  const signed = (): number => {
    let sign = 1;
    while (true) {
      if (take("-")) sign = -sign;
      else if (!take("+")) break;
    }
    return sign * base();
  };
  const power = (): number => {
    let n = signed();
    while (take("^")) n = Math.pow(n, signed());
    return n;
  };
  const product = (): number => {
    let n = power();
    while (true) {
      if (take("*")) n *= power();
      else if (take("/")) n /= power();
      else if (take("%")) n %= power();
      else return n;
    }
  };
  const sum = (): number => {
    let n = product();
    while (true) {
      if (take("+")) n += product();
      else if (take("-")) n -= product();
      else return n;
    }
  };
  const list = (): number => {
    let n = sum();
    while (take(",")) n = sum();
    return n;
  };
  try {
    const n = list();
    ws();
    if (offset !== text.length || Number.isNaN(n)) fail();
    return Number.isFinite(n) ? n : null;
  } catch {
    const n = parseFloat(text);
    return Number.isFinite(n) ? n : null;
  }
}
