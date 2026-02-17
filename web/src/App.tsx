import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

// -----------------------------
// Types
// -----------------------------
interface Pack {
	name: string;
	priceYen: number;
	gems: number;
}

interface MinCostResult {
	costYen: number;
	gems: number;
	counts: number[];
}

// -----------------------------
// Utilities
// -----------------------------
function toNum(v: string | number, fallback = 0): number {
	const n = Number(String(v).replace(/,/g, '').trim());
	return Number.isFinite(n) ? n : fallback;
}

function yen(n: number): string {
	if (!Number.isFinite(n)) return '-';
	return Math.round(n).toLocaleString('ja-JP') + '円';
}

function fmt(n: number, digits = 0): string {
	if (!Number.isFinite(n)) return '-';
	return n.toLocaleString('ja-JP', {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	});
}

function ceilInt(n: number): number {
	return Math.ceil(n - 1e-12);
}

/**
 * 最小課金（パック整数購入）を探索
 * packs: [{ name, priceYen, gems }]
 */
function minCostForGems(gemsNeeded: number, packs: Pack[]): MinCostResult {
	const need = Math.max(0, ceilInt(gemsNeeded));
	if (need === 0) {
		return {
			costYen: 0,
			gems: 0,
			counts: packs.map(() => 0),
		};
	}

	// packsを「大→小」で並べ替えて探索しやすくする
	const indexed = packs.map((p, i) => ({ ...p, i })).sort((a, b) => b.gems - a.gems);

	const max0 = ceilInt(need / indexed[0].gems) + 3;
	const max1 = ceilInt(need / indexed[1].gems) + 3;
	const max2 = ceilInt(need / indexed[2].gems) + 3;

	let best = {
		costYen: Infinity,
		gems: Infinity,
		countsSorted: [0, 0, 0],
	};

	// 3パックなので総当たり（上限は小さめ）
	for (let a = 0; a <= max0; a++) {
		// 早期打ち切り
		const costA = a * indexed[0].priceYen;
		if (costA > best.costYen) continue;

		for (let b = 0; b <= max1; b++) {
			const costAB = costA + b * indexed[1].priceYen;
			if (costAB > best.costYen) continue;

			// cは必要分だけ計算しても良いが、端数最適化のため±数も見る
			const gemsAB = a * indexed[0].gems + b * indexed[1].gems;
			const remaining = need - gemsAB;

			const cBase = remaining > 0 ? ceilInt(remaining / indexed[2].gems) : 0;
			for (let delta = -2; delta <= 2; delta++) {
				const c = Math.max(0, cBase + delta);
				if (c > max2) continue;

				const gems = gemsAB + c * indexed[2].gems;
				if (gems < need) continue;

				const cost = costAB + c * indexed[2].priceYen;
				if (cost < best.costYen) {
					best = { costYen: cost, gems, countsSorted: [a, b, c] };
				} else if (cost === best.costYen && gems < best.gems) {
					// 同額なら余りが少ない方
					best = { costYen: cost, gems, countsSorted: [a, b, c] };
				}
			}
		}
	}

	// 元の順番に戻す
	const counts = packs.map(() => 0);
	best.countsSorted.forEach((cnt, idx) => {
		counts[indexed[idx].i] = cnt;
	});

	return {
		costYen: best.costYen,
		gems: best.gems,
		counts,
	};
}

function bestUnitPrice(packs: Pack[]): { unit: number; pack: Pack | null } {
	let best: { unit: number; pack: Pack | null } = { unit: Infinity, pack: null };
	for (const p of packs) {
		const unit = p.priceYen / p.gems;
		if (unit < best.unit) best = { unit, pack: p };
	}
	return best;
}

// -----------------------------
// Main App
// -----------------------------
export default function SimulatorApp() {
	// --- Shared settings
	const [gemPer10, setGemPer10] = useState<string | number>(1500);
	const [runoPerGem, setRunoPerGem] = useState<string | number>(500);

	const [pack15000Gems, setPack15000Gems] = useState<string | number>(7676);
	const [pack7500Gems, setPack7500Gems] = useState<string | number>(3808);
	const [pack4500Gems, setPack4500Gems] = useState<string | number>(2268);

	const packs = useMemo(
		() => [
			{ name: '15,000円', priceYen: 15000, gems: toNum(pack15000Gems, 0) },
			{ name: '7,500円', priceYen: 7500, gems: toNum(pack7500Gems, 0) },
			{ name: '4,500円', priceYen: 4500, gems: toNum(pack4500Gems, 0) },
		],
		[pack15000Gems, pack7500Gems, pack4500Gems],
	);

	const gemPerPull = useMemo(() => toNum(gemPer10, 0) / 10, [gemPer10]);

	// --- Will: buy vs gacha
	const [willPriceRuno, setWillPriceRuno] = useState<string | number>(2100000);
	const [willBuyCount, setWillBuyCount] = useState<string | number>(4);

	// gacha rates for Will/Imagine
	const [aPlusTotal, setAPlusTotal] = useState<string | number>(4.75); // %
	const [sShareWithinAPlus, setSShareWithinAPlus] = useState<string | number>(15); // %
	const [aPoolSize, setAPoolSize] = useState<string | number>(14);
	const [desiredTypes, setDesiredTypes] = useState<string | number>(1);
	const [targetCopies, setTargetCopies] = useState<string | number>(4);

	// --- Costume: collect A tokens/items
	const [costumeNeedA, setCostumeNeedA] = useState<string | number>(15);
	const [costumeATotal, setCostumeATotal] = useState<string | number>(3.675); // % A total (incl. pity)

	// -----------------------------
	// Computations
	// -----------------------------

	// Unit
	const best = useMemo(() => bestUnitPrice(packs), [packs]);

	// 80連/100連 quick calc (useful as reference)
	const quick = useMemo(() => {
		const need80 = gemPerPull * 80;
		const need100 = gemPerPull * 100;
		return {
			need80,
			need100,
			min80: minCostForGems(need80, packs),
			min100: minCostForGems(need100, packs),
		};
	}, [gemPerPull, packs]);

	// Buy Will with runo via gems
	const willBuy = useMemo(() => {
		const price = toNum(willPriceRuno, 0);
		const count = toNum(willBuyCount, 0);
		const totalRuno = price * count;
		const gemsNeeded = totalRuno / Math.max(1, toNum(runoPerGem, 1));
		const minPay = minCostForGems(gemsNeeded, packs);
		const theo = gemsNeeded * best.unit;
		return { totalRuno, gemsNeeded, minPay, theo };
	}, [willPriceRuno, willBuyCount, runoPerGem, packs, best.unit]);

	// Gacha expected for desired A items
	const willGacha = useMemo(() => {
		const pAplus = toNum(aPlusTotal, 0) / 100;
		const sShare = toNum(sShareWithinAPlus, 0) / 100;
		const pA = pAplus * (1 - sShare);

		const pool = Math.max(1, toNum(aPoolSize, 1));
		const desired = Math.min(pool, Math.max(1, toNum(desiredTypes, 1)));

		const pDesiredA = pA * (desired / pool);

		const copies = Math.max(1, toNum(targetCopies, 1));

		// 期待試行回数（成功 copies 回）
		const expectedPulls = copies / Math.max(1e-12, pDesiredA);
		const expectedGems = expectedPulls * gemPerPull;

		const minPay = minCostForGems(expectedGems, packs);
		const theo = expectedGems * best.unit;

		return {
			pAplus,
			pA,
			pDesiredA,
			expectedPulls,
			expectedGems,
			theo,
			minPay,
		};
	}, [aPlusTotal, sShareWithinAPlus, aPoolSize, desiredTypes, targetCopies, gemPerPull, packs, best.unit]);

	// Costume (collect A items regardless of type)
	const costume = useMemo(() => {
		const pA = toNum(costumeATotal, 0) / 100;
		const need = Math.max(1, toNum(costumeNeedA, 1));
		const expectedPulls = need / Math.max(1e-12, pA);
		const expectedGems = expectedPulls * gemPerPull;
		const minPay = minCostForGems(expectedGems, packs);
		const theo = expectedGems * best.unit;
		return { pA, need, expectedPulls, expectedGems, theo, minPay };
	}, [costumeATotal, costumeNeedA, gemPerPull, packs, best.unit]);

	// Compare Buy vs Gacha for Will scenario
	const compare = useMemo(() => {
		const buyYen = willBuy.minPay.costYen;
		const gachaYen = willGacha.minPay.costYen;
		const diff = gachaYen - buyYen;
		return { buyYen, gachaYen, diff };
	}, [willBuy.minPay.costYen, willGacha.minPay.costYen]);

	// -----------------------------
	// UI
	// -----------------------------
	return (
		<div className="min-h-screen w-full p-4 md:p-8">
			<div className="mx-auto max-w-5xl space-y-4">
				<div className="space-y-1">
					<h1 className="text-2xl md:text-3xl font-semibold">ウィル・イマジン・衣装 シミュレーター</h1>
					<p className="text-sm text-muted-foreground">「ジェム→非バインドルーノ購入」と「ガチャ期待値」を同じ前提で比較します。数字はすべて入力で変更できます。</p>
				</div>

				<Card className="rounded-2xl">
					<CardHeader>
						<CardTitle>共通設定</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid gap-4 md:grid-cols-3">
							<div className="space-y-2">
								<Label>10連に必要なジェム</Label>
								<Input value={gemPer10} onChange={(e) => setGemPer10(e.target.value)} />
								<p className="text-xs text-muted-foreground">1回あたり：{fmt(gemPerPull, 2)}ジェム</p>
							</div>
							<div className="space-y-2">
								<Label>1ジェム→非バインドルーノ</Label>
								<Input value={runoPerGem} onChange={(e) => setRunoPerGem(e.target.value)} />
							</div>
							<div className="space-y-2">
								<Label>最安ジェム単価（参考）</Label>
								<div className="rounded-xl border p-3 text-sm">
									<div>
										最安パック：<span className="font-medium">{best.pack?.name ?? '-'}</span>
									</div>
									<div>
										単価：<span className="font-medium">{fmt(best.unit, 4)}</span> 円/ジェム
									</div>
								</div>
							</div>
						</div>

						<Separator />

						<div className="space-y-2">
							<div className="text-sm font-medium">ガチャに使えるジェムパック（通常分）</div>
							<div className="grid gap-4 md:grid-cols-3">
								<div className="space-y-2">
									<Label>15,000円パックのジェム</Label>
									<Input value={pack15000Gems} onChange={(e) => setPack15000Gems(e.target.value)} />
								</div>
								<div className="space-y-2">
									<Label>7,500円パックのジェム</Label>
									<Input value={pack7500Gems} onChange={(e) => setPack7500Gems(e.target.value)} />
								</div>
								<div className="space-y-2">
									<Label>4,500円パックのジェム</Label>
									<Input value={pack4500Gems} onChange={(e) => setPack4500Gems(e.target.value)} />
								</div>
							</div>
							<p className="text-xs text-muted-foreground">※初回ボーナスがバインドでガチャ不可なら、ここは「ガチャに使える分」だけを入れてください。</p>
						</div>

						<Separator />

						<div className="grid gap-4 md:grid-cols-2">
							<Card className="rounded-2xl">
								<CardHeader>
									<CardTitle className="text-base">天井の参考（この設定で）</CardTitle>
								</CardHeader>
								<CardContent className="space-y-2 text-sm">
									<div className="flex items-center justify-between">
										<span>80連 必要ジェム</span>
										<span className="font-medium">{fmt(quick.need80, 0)}</span>
									</div>
									<div className="flex items-center justify-between">
										<span>最小課金</span>
										<span className="font-medium">{yen(quick.min80.costYen)}</span>
									</div>
									<div className="text-xs text-muted-foreground">内訳：{packs.map((p, i) => `${p.name}×${quick.min80.counts[i]}`).join(' / ')}</div>
									<Separator className="my-2" />
									<div className="flex items-center justify-between">
										<span>100連 必要ジェム</span>
										<span className="font-medium">{fmt(quick.need100, 0)}</span>
									</div>
									<div className="flex items-center justify-between">
										<span>最小課金</span>
										<span className="font-medium">{yen(quick.min100.costYen)}</span>
									</div>
									<div className="text-xs text-muted-foreground">内訳：{packs.map((p, i) => `${p.name}×${quick.min100.counts[i]}`).join(' / ')}</div>
								</CardContent>
							</Card>

							<Card className="rounded-2xl">
								<CardHeader>
									<CardTitle className="text-base">使い方メモ</CardTitle>
								</CardHeader>
								<CardContent className="text-sm space-y-2">
									<ul className="list-disc pl-5 space-y-1">
										<li>「期待値」は平均。実際はブレます（運）。</li>
										<li>「最小課金」は提示パックのみで、必要ジェム以上になる最小支払額。</li>
										<li>確定（天井/保証）がある場合、確率は「確定込みの総合確率」を入れると一致しやすいです。</li>
									</ul>
								</CardContent>
							</Card>
						</div>
					</CardContent>
				</Card>

				<Tabs defaultValue="will" className="w-full">
					<TabsList className="grid w-full grid-cols-3">
						<TabsTrigger value="will">ウィル/イマジン（購入 vs ガチャ）</TabsTrigger>
						<TabsTrigger value="costume">衣装（A素材を集める）</TabsTrigger>
						<TabsTrigger value="quick">単発計算</TabsTrigger>
					</TabsList>

					{/* Will/Imagine */}
					<TabsContent value="will" className="space-y-4">
						<div className="grid gap-4 md:grid-cols-2">
							<Card className="rounded-2xl">
								<CardHeader>
									<CardTitle className="text-base">非バインドルーノで確実に買う</CardTitle>
								</CardHeader>
								<CardContent className="space-y-3">
									<div className="grid gap-4 md:grid-cols-2">
										<div className="space-y-2">
											<Label>ウィル1個の価格（ルーノ）</Label>
											<Input value={willPriceRuno} onChange={(e) => setWillPriceRuno(e.target.value)} />
										</div>
										<div className="space-y-2">
											<Label>購入数</Label>
											<Input value={willBuyCount} onChange={(e) => setWillBuyCount(e.target.value)} />
										</div>
									</div>

									<div className="rounded-xl border p-3 text-sm space-y-1">
										<div className="flex items-center justify-between">
											<span>必要ルーノ合計</span>
											<span className="font-medium">{fmt(willBuy.totalRuno, 0)}</span>
										</div>
										<div className="flex items-center justify-between">
											<span>必要ジェム</span>
											<span className="font-medium">{fmt(willBuy.gemsNeeded, 0)}</span>
										</div>
										<div className="flex items-center justify-between">
											<span>理論額（最安単価換算）</span>
											<span className="font-medium">{yen(willBuy.theo)}</span>
										</div>
										<div className="flex items-center justify-between">
											<span>最小課金（パック）</span>
											<span className="font-medium">{yen(willBuy.minPay.costYen)}</span>
										</div>
										<div className="text-xs text-muted-foreground">
											内訳：{packs.map((p, i) => `${p.name}×${willBuy.minPay.counts[i]}`).join(' / ')}（受取 {fmt(willBuy.minPay.gems, 0)} ジェム）
										</div>
									</div>
								</CardContent>
							</Card>

							<Card className="rounded-2xl">
								<CardHeader>
									<CardTitle className="text-base">ガチャで狙う（Aプールから）</CardTitle>
								</CardHeader>
								<CardContent className="space-y-3">
									<div className="grid gap-4 md:grid-cols-2">
										<div className="space-y-2">
											<Label>A以上の総合確率（確定込み, %）</Label>
											<Input value={aPlusTotal} onChange={(e) => setAPlusTotal(e.target.value)} />
										</div>
										<div className="space-y-2">
											<Label>そのうちSになる割合（%）</Label>
											<Input value={sShareWithinAPlus} onChange={(e) => setSShareWithinAPlus(e.target.value)} />
											<p className="text-xs text-muted-foreground">例：0.15 なら 15 と入力</p>
										</div>
										<div className="space-y-2">
											<Label>Aランクの種類数</Label>
											<Input value={aPoolSize} onChange={(e) => setAPoolSize(e.target.value)} />
										</div>
										<div className="space-y-2">
											<Label>欲しい種類数（1種類 or 2種類）</Label>
											<Input value={desiredTypes} onChange={(e) => setDesiredTypes(e.target.value)} />
										</div>
										<div className="space-y-2">
											<Label>必要個数（例：4個）</Label>
											<Input value={targetCopies} onChange={(e) => setTargetCopies(e.target.value)} />
										</div>
									</div>

									<div className="rounded-xl border p-3 text-sm space-y-1">
										<div className="flex items-center justify-between">
											<span>A以上</span>
											<span className="font-medium">{fmt(willGacha.pAplus * 100, 4)}%</span>
										</div>
										<div className="flex items-center justify-between">
											<span>A（Sを除く）</span>
											<span className="font-medium">{fmt(willGacha.pA * 100, 4)}%</span>
										</div>
										<div className="flex items-center justify-between">
											<span>欲しいAが出る確率</span>
											<span className="font-medium">{fmt(willGacha.pDesiredA * 100, 4)}%</span>
										</div>
										<Separator className="my-2" />
										<div className="flex items-center justify-between">
											<span>期待ガチャ回数</span>
											<span className="font-medium">{fmt(willGacha.expectedPulls, 0)}回</span>
										</div>
										<div className="flex items-center justify-between">
											<span>期待ジェム</span>
											<span className="font-medium">{fmt(willGacha.expectedGems, 0)}</span>
										</div>
										<div className="flex items-center justify-between">
											<span>理論額（最安単価換算）</span>
											<span className="font-medium">{yen(willGacha.theo)}</span>
										</div>
										<div className="flex items-center justify-between">
											<span>最小課金（パック）</span>
											<span className="font-medium">{yen(willGacha.minPay.costYen)}</span>
										</div>
										<div className="text-xs text-muted-foreground">
											内訳：{packs.map((p, i) => `${p.name}×${willGacha.minPay.counts[i]}`).join(' / ')}（受取 {fmt(willGacha.minPay.gems, 0)} ジェム）
										</div>
									</div>

									<div className="rounded-xl border p-3 text-sm">
										<div className="font-medium mb-1">比較（最小課金ベース）</div>
										<div className="flex items-center justify-between">
											<span>購入（ルーノ）</span>
											<span className="font-medium">{yen(compare.buyYen)}</span>
										</div>
										<div className="flex items-center justify-between">
											<span>ガチャ（期待値）</span>
											<span className="font-medium">{yen(compare.gachaYen)}</span>
										</div>
										<div className="flex items-center justify-between">
											<span>差（ガチャ−購入）</span>
											<span className={'font-medium ' + (compare.diff >= 0 ? 'text-red-600' : 'text-emerald-600')}>
												{compare.diff >= 0 ? '+' : ''}
												{yen(compare.diff)}
											</span>
										</div>
										<p className="text-xs text-muted-foreground mt-2">※この比較は「Sが当たりにカウントされない（=Aのみ欲しい）」前提です。Sも当たりなら確率を調整してください。</p>
									</div>
								</CardContent>
							</Card>
						</div>
					</TabsContent>

					{/* Costume */}
					<TabsContent value="costume" className="space-y-4">
						<Card className="rounded-2xl">
							<CardHeader>
								<CardTitle className="text-base">衣装交換：Aランク素材を◯個集める</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="grid gap-4 md:grid-cols-3">
									<div className="space-y-2">
										<Label>必要A個数</Label>
										<Input value={costumeNeedA} onChange={(e) => setCostumeNeedA(e.target.value)} />
									</div>
									<div className="space-y-2">
										<Label>Aランク総合出現率（確定込み, %）</Label>
										<Input value={costumeATotal} onChange={(e) => setCostumeATotal(e.target.value)} />
									</div>
									<div className="space-y-2">
										<Label>（参考）1回あたりジェム</Label>
										<div className="rounded-xl border p-3 text-sm">{fmt(gemPerPull, 2)} ジェム</div>
									</div>
								</div>

								<div className="rounded-2xl border p-4 text-sm space-y-2">
									<div className="flex items-center justify-between">
										<span>A確率</span>
										<span className="font-medium">{fmt(costume.pA * 100, 4)}%</span>
									</div>
									<div className="flex items-center justify-between">
										<span>期待ガチャ回数</span>
										<span className="font-medium">{fmt(costume.expectedPulls, 0)}回</span>
									</div>
									<div className="flex items-center justify-between">
										<span>期待ジェム</span>
										<span className="font-medium">{fmt(costume.expectedGems, 0)}</span>
									</div>
									<div className="flex items-center justify-between">
										<span>理論額（最安単価換算）</span>
										<span className="font-medium">{yen(costume.theo)}</span>
									</div>
									<div className="flex items-center justify-between">
										<span>最小課金（パック）</span>
										<span className="font-medium">{yen(costume.minPay.costYen)}</span>
									</div>
									<div className="text-xs text-muted-foreground">
										内訳：{packs.map((p, i) => `${p.name}×${costume.minPay.counts[i]}`).join(' / ')}（受取 {fmt(costume.minPay.gems, 0)} ジェム）
									</div>
								</div>
							</CardContent>
						</Card>
					</TabsContent>

					{/* Quick */}
					<TabsContent value="quick" className="space-y-4">
						<Card className="rounded-2xl">
							<CardHeader>
								<CardTitle className="text-base">単発計算（連数→必要ジェム/最小課金）</CardTitle>
							</CardHeader>
							<CardContent className="space-y-3">
								<QuickCalc gemPerPull={gemPerPull} packs={packs} />
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>

				<div className="pb-8 text-xs text-muted-foreground">注：このアプリは「期待値（平均）」中心です。確率のばらつき（例えば90%で到達など）も必要なら追加できます。</div>
			</div>
		</div>
	);
}

function QuickCalc({ gemPerPull, packs }: { gemPerPull: number; packs: Pack[] }) {
	const [pulls, setPulls] = useState<string | number>(30);

	const res = useMemo(() => {
		const p = Math.max(0, toNum(pulls, 0));
		const gems = p * gemPerPull;
		const minPay = minCostForGems(gems, packs);
		return { pulls: p, gems, minPay };
	}, [pulls, gemPerPull, packs]);

	return (
		<div className="space-y-3">
			<div className="grid gap-4 md:grid-cols-3">
				<div className="space-y-2">
					<Label>回す連数（例：30連）</Label>
					<Input value={pulls} onChange={(e) => setPulls(e.target.value)} />
				</div>
				<div className="space-y-2">
					<Label>必要ジェム</Label>
					<div className="rounded-xl border p-3 text-sm">{fmt(res.gems, 0)}</div>
				</div>
				<div className="space-y-2">
					<Label>最小課金</Label>
					<div className="rounded-xl border p-3 text-sm">{yen(res.minPay.costYen)}</div>
				</div>
			</div>

			<div className="rounded-xl border p-3 text-sm">
				<div className="text-xs text-muted-foreground mb-1">内訳</div>
				<div>{packs.map((p, i) => `${p.name}×${res.minPay.counts[i]}`).join(' / ')}</div>
				<div className="text-xs text-muted-foreground mt-1">
					受取 {fmt(res.minPay.gems, 0)} ジェム（余り {fmt(res.minPay.gems - ceilInt(res.gems), 0)} ジェム）
				</div>
			</div>

			<div className="flex gap-2 flex-wrap">
				{[10, 20, 30, 40, 50, 80, 100].map((n) => (
					<Button key={n} variant="secondary" onClick={() => setPulls(n)} className="rounded-xl">
						{n}連
					</Button>
				))}
			</div>
		</div>
	);
}
