from fastapi import FastAPI                # FastAPI 임포트
from fastapi.middleware.cors import CORSMiddleware # CORS 미들웨어 임포트
from pydantic import BaseModel             # Pydantic BaseModel 임포트
import pandas as pd                        # pandas 임포트

app = FastAPI()                            # FastAPI 앱 객체 생성

# CORS 미들웨어 설정 (모든 origin 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# 데이터 로딩 (엑셀에서 농약/조합/기작 시트 불러옴)
product_df = pd.read_excel("data/20250705_농약제품 목록.xlsx")
combo_df   = pd.read_excel("data/농약조합 표 및 작용기작.xlsx", sheet_name=0)
mech_df    = pd.read_excel("data/농약조합 표 및 작용기작.xlsx", sheet_name=1)

# 금기 조합 추출
combo_df = combo_df.set_index(combo_df.columns[0])
invalid_combos = set()
for i, row in combo_df.iterrows():
    for j, val in row.items():
        if str(val).strip().upper() == "X":       # X 표기된 조합만 금기
            invalid_combos.add(frozenset([str(i).strip(), str(j).strip()]))

# 기작 설명 및 작용원리/부위 추출
mech_df.columns = [c.strip() for c in mech_df.columns]
mechanism_info = {
    str(r["작용기작"]).strip(): {
        "mechanism_name": r["기작명"],          # 기작명
        "mode_of_action": r["작용"],           # 작용원리
        "site_of_action": r["작용부위"],       # 작용부위
    }
    for _, r in mech_df.iterrows()
}

# 문자열에서 +로 분리해 set으로 반환
def split_mechs(mech: str) -> set[str]:
    return {m.strip() for m in str(mech).split("+")}

# 기작번호 숫자부만 추출
def mech_base(m: str) -> str:
    return ''.join(filter(str.isdigit, m))

# pest_list 전체가 s1이나 s2에서 방제되는지
def can_control_all_pests(pest_list, s1: set[str], s2: set[str]) -> bool:
    return all(p in s1 or p in s2 for p in pest_list)

# 작물 목록
@app.get("/crops")
def get_crops():
    return {"crops": sorted(product_df["작물명"].dropna().astype(str).unique())}

# 특정 작물의 병해충 목록
@app.get("/pests")
def get_pests(crop: str):
    df = product_df[product_df["작물명"] == crop]
    return {"pests": sorted(df["적용병해충"].dropna().unique())}

# 전체 기작번호 목록
@app.get("/mechanisms")
def get_mechanisms():
    mechs = product_df["작용기작"].dropna().astype(str)
    parts = [m.strip() for mech in mechs for m in mech.split("+")]
    return {"mechanisms": sorted(set(parts))}

# 전체 농약(상표명) 목록
@app.get("/products")
def get_products():
    return {"products": sorted(product_df["상표명"].dropna().unique())}

# 추천 API 데이터 모델 정의
class RecommendRequest(BaseModel):
    crop: str
    pests_or_diseases: list[str]
    used_mechanisms: list[str]
    owned_products: list[str]

# 추천 API (POST)
@app.post("/recommend")
def recommend(req: RecommendRequest):
    crop, pests, used, owned = (
        req.crop,
        set(req.pests_or_diseases),
        set(req.used_mechanisms),
        set(req.owned_products),
    )

    # 1) 기본 필터: 선택 작물 + 병해충 적용 농약만
    df = product_df[
        (product_df["작물명"] == crop) &
        (product_df["적용병해충"].notna())
    ].copy()

    # 2) 제외 기작 필터
    df = df[df["작용기작"].apply(lambda m: all(p not in used for p in split_mechs(str(m))))]

    # 3) 살균/살충 구분 필터 (선택 병해충을 방제 가능한 카테고리만 허용)
    allowed_cats = set(df[df["적용병해충"].isin(pests)]["구분"].dropna().unique())
    df = df[df["구분"].isin(allowed_cats)]

    # 4) 기작번호별 그룹화
    groups = df.groupby("작용기작")
    keys = list(groups.groups.keys())

    result = []

    # (A) 단일 농약 추천
    for key in keys:
        grp = groups.get_group(key)
        cov = set(grp["적용병해충"])
        if pests.issubset(cov):  # 선택 병해충 모두 커버
            names = grp["상표명"].unique().tolist()
            if owned and not (set(names) & owned):
                continue
            mechanism_names = []
            mode_of_actions = []
            sites_of_actions=[]
            for m in split_mechs(key):
                info = mechanism_info.get(m, {})
                if info.get("mechanism_name"):
                    mechanism_names.append(info["mechanism_name"])
                if info.get("mode_of_action"):
                    mode_of_actions.append(info["mode_of_action"])
                if info.get("site_of_action"):         # 작용부위
                    sites_of_actions.append(info["site_of_action"])
            result.append([{
                "product": ", ".join(names),
                "mechanism": key,
                "mechanism_name": " + ".join(mechanism_names),   # 기작명 모두 출력
                "mode_of_action": " / ".join(mode_of_actions),   # 작용원리 모두 출력
                "site_of_action": " / ".join(sites_of_actions),  # 작용부위 모두 출력
                "type": grp.iloc[0]["제형"],
                "pests": sorted(list(cov & pests)),              # 선택 병해충만 표시
            }])

    # (B) 두 농약 조합 추천
    for i in range(len(keys)):
        for j in range(i+1, len(keys)):
            k1, k2 = keys[i], keys[j]
            p1, p2 = split_mechs(k1), split_mechs(k2)

            if any(mech_base(a)==mech_base(b) for a in p1 for b in p2): continue
            if any(frozenset({a,b}) in invalid_combos for a in p1 for b in p2): continue

            g1, g2 = groups.get_group(k1), groups.get_group(k2)
            c1, c2 = set(g1["적용병해충"]), set(g2["적용병해충"])

            if not (c1 & pests): continue   # 각 농약이 최소 1개 선택 병해충 방제
            if not (c2 & pests): continue

            if not can_control_all_pests(pests, c1, c2): continue

            names1, names2 = set(g1["상표명"]), set(g2["상표명"])
            if owned and not (names1 & owned or names2 & owned): continue

            mechanism_names1, mode_of_actions1,sites_of_actions1 = [], [], []
            for m in split_mechs(k1):
                info = mechanism_info.get(m, {})
                if info.get("mechanism_name"):
                    mechanism_names1.append(info["mechanism_name"])
                if info.get("mode_of_action"):
                    mode_of_actions1.append(info["mode_of_action"])
                if info.get("site_of_action"):
                    sites_of_actions1.append(info["site_of_action"])

            mechanism_names2, mode_of_actions2, sites_of_actions2 = [], [], []
            for m in split_mechs(k2):
                info = mechanism_info.get(m, {})
                if info.get("mechanism_name"):
                    mechanism_names2.append(info["mechanism_name"])
                if info.get("mode_of_action"):
                    mode_of_actions2.append(info["mode_of_action"])
                if info.get("site_of_action"):
                    sites_of_actions2.append(info["site_of_action"])

            result.append([
                {
                  "product": ", ".join(names1),
                  "mechanism": k1,
                  "mechanism_name": " + ".join(mechanism_names1),
                  "mode_of_action": " / ".join(mode_of_actions1),
                  "site_of_action": " / ".join(sites_of_actions1),
                  "type": g1.iloc[0]["제형"],
                  "pests": sorted(list(c1 & pests)),
                },
                {
                  "product": ", ".join(names2),
                  "mechanism": k2,
                  "mechanism_name": " + ".join(mechanism_names2),
                  "mode_of_action": " / ".join(mode_of_actions2),
                  "site_of_action": " / ".join(sites_of_actions2),
                  "type": g2.iloc[0]["제형"],
                  "pests": sorted(list(c2 & pests)),
                }
            ])

    return {"recommendations": result}
