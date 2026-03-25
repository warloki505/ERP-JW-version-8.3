(function(){
  'use strict';

  const out = document.getElementById('log');
  const result = document.getElementById('result');

  function log(msg){ out.textContent += msg + "\n"; }
  function assert(name, cond){
    if(!cond) throw new Error("FAIL: " + name);
    log("OK: " + name);
  }

  const tests = [];

  tests.push(function testSelectedMonth(){
    const uid = "test-user";
    Core.selectedMonth.set(uid, "2026-02");
    assert("Core.selectedMonth.get", Core.selectedMonth.get(uid) === "2026-02");
  });

  tests.push(function testSafeStr(){
    assert("Core.safe.str remove html", Core.safe.str("<b>x</b>") === "x");
    assert("Core.safe.str block __proto__", Core.safe.str("__proto__") === "");
  });

  tests.push(function testMoney(){
    assert("Core.money.format", typeof Core.money.format(123.45) === "string");
  });

  let passed = 0;
  let failed = 0;

  try{
    tests.forEach(fn => fn());
    passed = tests.length;
  }catch(e){
    failed = 1;
    log(String(e));
  }

  result.innerHTML = failed ? '<p class="fail">❌ Falhou</p>' : '<p class="ok">✅ OK</p>';
  log("Total: " + tests.length + " | Passou: " + passed + " | Falhou: " + failed);
})();