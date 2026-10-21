export default function RulesPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="rounded-xl border border-white/10 bg-panel/80 p-4 text-sm leading-relaxed">
      <summary className="cursor-pointer text-base font-bold text-ink">ルール</summary>
      <RulesContent className="mt-3" />
    </details>
  );
}

export function RulesContent({ className = "" }: { className?: string }) {
  return (
    <div className={`space-y-3 text-white/70 ${className}`}>
      <p>
        <b className="text-ink">目的</b>: 共有の盤面に線を引いて、自分の電源の<b className="text-ink">＋と−をつなぐ</b>。
        つながった回路の中にある三角形1つにつき1点。
      </p>
      <p>
        <b className="text-ink">電源</b>: 盤面のまわりに <b className="text-blue">青＋</b>・<b className="text-yellow">黄＋</b>・
        <b className="text-blue">青−</b>・<b className="text-yellow">黄−</b> の順に並んでいる。
      </p>
      <p>
        <b className="text-ink">手番</b>: 交互に、好きな2点を結ぶ線を1本引く(パスはできない)。距離の制限はないが、
        <b className="text-ink">ほかの線との交差</b>と<b className="text-ink">点の飛び越え</b>はできない。線は灰色で、どちらのプレイヤーも使える。
      </p>
      <p>
        <b className="text-ink">通電</b>: 自分の＋から−まで、同じ点を二度通らずにたどれる道すべてに電気が流れる。
        3辺とも電気が流れた三角形が得点になる(中に点や線があってもよい。電源の端子を角に使った三角形は数えない)。
      </p>
      <p>
        <b className="text-ink">通電のあと</b>: 得点した三角形の<b className="text-ink">辺と角の点</b>が消える(消えた点につながる線も消える)。
        さらに回路をつないだ<b className="text-ink">最後の線</b>も消えるので、回路はまた切れる。それ以外の線は残る。
        三角形がない回路は、最後の線だけが消えて0点。
      </p>
      <p>
        <b className="text-ink">相手の線でつながったら</b>: 判定するのは線を引いた人の回路だけ。相手の線で自分の回路がつながった場合は、
        <b className="text-ink">自分の番のはじめ</b>に通電する(その線が消える)。そのあと普通に1本引ける。
      </p>
      <p>
        <b className="text-ink">終了</b>: 引ける線がなくなったら終わり。同じ盤面がくり返されたとき(0点の通電が続いて何も変わらないとき)も終わり。
        得点の多い人の勝ち。
      </p>
    </div>
  );
}
