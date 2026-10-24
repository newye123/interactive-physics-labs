/* 剧情数据 · 第 4 集 —— 老师可以直接改台词（改完保存、刷新页面即可）
   卡片类型：
     call     来电（全屏，beats[] 一句一句推）
     mission  任务卡（goal 目标 + pi 预测三步 + actions 动作清单）
     debrief  结案卡（自动带出"现场记录"与课堂数据）
     file     事故档案卡（对应本节高频错误）
     exit     出口题卡（教材页码）
   mission.actions 三种动作：
     { label, cmd: 'preset:series' }     ⚡ 一键命令（加载预置）
     { label, watch: 'switch-closed' }   ⬜ 等实验室里发生这个动作（自动打勾）
     { label, snap: '标签' }             📌 记下当前读数（进结案卡对比） */
(function () {
  var M = window.CL_MISSIONS = window.CL_MISSIONS || {};
  M['11-4'] = {
    id: '11-4',
    title: '第 4 集《一排灯全灭》',
    sub: '11.4 串联电路和并联电路 · 教材 p68–70',
    cards: [
      {
        t: 'call', who: '王师傅', tag: '校史馆翻修现场 · 来电',
        beats: [
          '小陈？我是王师傅。校史馆的展柜灯带，我装好了。',
          '刚才我一合闸——哢，整排灯全灭了。',
          '两条灯带，我用的接法不一样。你先别急着修——替我想明白：到底哪种接法，坏一颗灯就整排灭？'
        ]
      },
      {
        t: 'mission', title: '任务① · 先判断，再动手',
        goal: '两条灯带：一条<b>一串到底</b>（串联），一条<b>各走各的</b>（并联）。' +
          '坏一颗灯，哪条会整排灭？<span class="stg-dim">（先猜，再上台验证）</span>',
        pi: true,
        actions: []
      },
      {
        t: 'mission', title: '任务② · 上台验证：串联',
        goal: '请一位同学上台当"实习电工"：加载「串联两灯」，合上开关，再拆掉一颗灯——盯住：另一颗还亮不亮？',
        actions: [
          { label: '加载「串联两灯」预置', cmd: 'preset:series' },
          { label: '合上开关（点一下开关）', watch: 'switch-closed' },
          { label: '拆掉一颗灯（选中它 → 点「删除这个元件」）', watch: 'bulb-removed' },
          { label: '记下此刻读数', snap: '串联 · 拆灯后' }
        ]
      },
      {
        t: 'mission', title: '任务③ · 上台验证：并联',
        goal: '还是那位"实习电工"：加载「并联两灯」，合上开关，拆掉一颗——另一颗还亮吗？干路电流变成多少？',
        actions: [
          { label: '加载「并联两灯」预置', cmd: 'preset:parallel' },
          { label: '合上开关', watch: 'switch-closed' },
          { label: '拆掉一颗灯', watch: 'bulb-removed' },
          { label: '记下此刻读数', snap: '并联 · 拆灯后' }
        ]
      },
      {
        t: 'debrief', title: '结案卡 · 现场记录',
        intro: '把两次实测摆在一起——这就是回答王师傅的证据：',
        take: '串联"手拉手"：一颗坏，整排灭；并联"各走各的"：一颗坏，其余照常亮。',
        snapAll: true
      },
      {
        t: 'file', no: 4, title: '事故档案 #4 · 灯带全灭',
        body: '事故原因：展柜灯带被接成了串联——一颗灯坏，整排全灭。' +
          '档案提示：家里的灯、路口的灯、节日彩灯……它们都是并联。',
        tip: '先把这份档案放回柜子——等这一章学完，用它拼开档案柜的锁。'
      },
      {
        t: 'exit', title: '出口题 · 收工',
        goal: '教材 p69–70「练习与应用」第 2 题：当堂完成或作为课后作业。',
        extra: '附加一问（口头）：为什么家里的灯都要接成并联？——用今天的现场记录回答。'
      }
    ]
  };
})();
