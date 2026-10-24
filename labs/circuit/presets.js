/* 电路实验室 · 预置电路（教师一键开课） */
(function (root) {
  'use strict';
  var P = [
    {
      id: 'blank', name: '空白台（自由搭建）', desc: '从左侧元件库点一个、在台面上放一个。',
      comps: [], wires: []
    },
    {
      id: 'series', name: '串联两灯 · 谁更亮', desc: '合上开关前先让全班猜：两灯谁更亮？',
      comps: [
        { t: 'battery', x: 170, y: 520, p: { E: 4.5, r: 0.5 } },
        { t: 'switch', x: 410, y: 520, p: { closed: false } },
        { t: 'bulb', x: 660, y: 520 },
        { t: 'bulb', x: 900, y: 520 }
      ],
      wires: [[0, 0, 1, 1], [1, 0, 2, 1], [2, 0, 3, 1], [3, 0, 0, 1]]
    },
    {
      id: 'parallel', name: '并联两灯 · 拧走一个', desc: '两灯并联：拧下一只，另一只亮度变不变？',
      comps: [
        { t: 'battery', x: 170, y: 520, p: { E: 3.0, r: 0.5 } },
        { t: 'switch', x: 400, y: 520, p: { closed: false } },
        { t: 'bulb', x: 680, y: 360 },
        { t: 'bulb', x: 680, y: 660 }
      ],
      wires: [[0, 0, 1, 1], [1, 0, 2, 1], [1, 0, 3, 1], [2, 0, 0, 1], [3, 0, 0, 1]]
    },
    {
      id: 'ohm', name: '探究欧姆定律 · 记录数据', desc: '拖滑变改变电压，点「记录」攒点，看 U-I 图斜率。',
      comps: [
        { t: 'battery', x: 150, y: 560, p: { E: 4.5, r: 0.5 } },
        { t: 'switch', x: 340, y: 560, p: { closed: true } },
        { t: 'ammeter', x: 520, y: 560 },
        { t: 'rheostat', x: 710, y: 560, p: { Rmax: 20, frac: 1 } },
        { t: 'resistor', x: 920, y: 560, p: { R: 10 } },
        { t: 'voltmeter', x: 920, y: 380 }
      ],
      wires: [[0, 0, 1, 1], [1, 0, 2, 1], [2, 0, 3, 1], [3, 0, 4, 1], [4, 0, 0, 1], [5, 0, 4, 1], [5, 1, 4, 0]]
    },
    {
      id: 'emf', name: '测电动势和内阻 · 旧电池', desc: '滑变从大到小，记录多组 U、I；纵截距是 E，斜率是 −r。',
      comps: [
        { t: 'battery', x: 150, y: 560, p: { E: 1.5, r: 1.0 } },
        { t: 'switch', x: 340, y: 560, p: { closed: true } },
        { t: 'ammeter', x: 520, y: 560 },
        { t: 'rheostat', x: 720, y: 560, p: { Rmax: 20, frac: 1 } },
        { t: 'voltmeter', x: 435, y: 360 }
      ],
      wires: [[0, 0, 1, 1], [1, 0, 2, 1], [2, 0, 3, 1], [3, 0, 0, 1], [4, 0, 0, 0], [4, 1, 0, 1]]
    },
    {
      id: 'loading', name: '电表在"骗"你 · 真实 vs 理想', desc: '同一个分压电路：把顶栏表内阻切到"理想"再切回，看表读数一样吗？',
      comps: [
        { t: 'battery', x: 150, y: 560, p: { E: 6, r: 0.5 } },
        { t: 'resistor', x: 470, y: 560, p: { R: 3000 } },
        { t: 'resistor', x: 790, y: 560, p: { R: 3000 } },
        { t: 'voltmeter', x: 790, y: 340 }
      ],
      wires: [[0, 0, 1, 1], [1, 0, 2, 1], [2, 0, 0, 1], [3, 0, 2, 0], [3, 1, 2, 1]]
    },
    {
      id: 'short', name: '短路事故 · 电表超量程', desc: '合闸就是一节电池直接短路：先猜表盘会怎样。',
      comps: [
        { t: 'battery', x: 240, y: 520, p: { E: 4.5, r: 0.5 } },
        { t: 'ammeter', x: 560, y: 520 },
        { t: 'switch', x: 830, y: 520, p: { closed: false } }
      ],
      wires: [[0, 0, 1, 1], [1, 0, 2, 1], [2, 0, 0, 1]]
    }
  ];
  root.CircuitPresets = P;
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
})(typeof window !== 'undefined' ? window : globalThis);
