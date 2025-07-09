from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# 데이터 로딩
product_df = pd.read_excel("data/20250705_농약제품 목록.xlsx")
combo_df   = pd.read_excel("data/농약조합 표 및 작용기작.xlsx", sheet_name=0)
mech_df    = pd.read_excel("data/농약조합 표 및 작용기작.xlsx", sheet_name=1)

# 금기 조합
combo_df = combo_df.set_index(combo_df.columns[0])
invalid_combos = set()
for i, row in combo_df.iterrows():
    for j, val in row.items():
        if str(val).strip().upper() == "X":
            invalid_combos.add(frozenset([str(i).strip(), str(j).strip()]))

# 기작 설명
mech_df.columns = [c.strip() for c in mech_df.columns]
mechanism_info = {
    str(r["작용기작"]).strip(): {
        "explanation": r["기작명"],
        "ingredient": r["대표성분"]
    }
    for _, r in mech_df.iterrows()
}

def split_mechs(mech: str) -> set[str]:
    return {m.strip() for m in mech.split("+")}

def mech_base(m: str) -> str:
    return ''.join(filter(str.isdigit, m))

def can_control_all_pests(pest_list, s1: set[str], s2: set[str]) -> bool:
    return all(p in s1 or p in s2 for p in pest_list)

@app.get("/crops")
def get_crops():
    return {"crops": sorted(product_df["작물명"].dropna().astype(str).unique())}

@app.get("/pests")
def get_pests(crop: str):
    df = product_df[product_df["작물명"] == crop]
    return {"pests": sorted(df["적용병해충"].dropna().unique())}

@app.get("/mechanisms")
def get_mechanisms():
    mechs = product_df["작용기작"].dropna().astype(str)
    parts = [m.strip() for mech in mechs for m in mech.split("+")]
    return {"mechanisms": sorted(set(parts))}

@app.get("/products")
def get_products():
    return {"products": sorted(product_df["상표명"].dropna().unique())}

class RecommendRequest(BaseModel):
    crop: str
    pests_or_diseases: list[str]
    used_mechanisms: list[str]
    owned_products: list[str]

@app.post("/recommend")
def recommend(req: RecommendRequest):
    crop, pests, used, owned = (
        req.crop,
        set(req.pests_or_diseases),
        set(req.used_mechanisms),
        set(req.owned_products),
    )

    # 1) 기본 필터
    df = product_df[
        (product_df["작물명"] == crop) &
        (product_df["적용병해충"].notna())
    ].copy()

    # 2) 제외 기작
    df = df[df["작용기작"].apply(lambda m: all(p not in used for p in split_mechs(str(m))))]

    # 3) 살균/살충 구분 필터
    allowed_cats = set(df[df["적용병해충"].isin(pests)]["구분"].dropna().unique())
    df = df[df["구분"].isin(allowed_cats)]

    # 4) 그룹화
    groups = df.groupby("작용기작")
    keys = list(groups.groups.keys())

    result = []

    # (A) 단일 농약 추천
    for key in keys:
        grp = groups.get_group(key)
        cov = set(grp["적용병해충"])
        if pests.issubset(cov):
            names = grp["상표명"].unique().tolist()
            # ← 수정된 부분: owned 비어있지 않을 때만 보유농약 필터 적용
            if owned and not (set(names) & owned):
                continue
            result.append([{
                "product": ", ".join(names),
                "mechanism": key,
                "ingredient": grp.iloc[0]["품목명"],
                "date": grp.iloc[0]["등록일"],
                "type": grp.iloc[0]["제형"],
                "explanation": mechanism_info.get(key, {}).get("explanation",""),
            }])

    # (B) 두 농약 조합 추천
    for i in range(len(keys)):
        for j in range(i+1, len(keys)):
            k1, k2 = keys[i], keys[j]
            p1, p2 = split_mechs(k1), split_mechs(k2)

            # 중복/금기 제거
            if any(mech_base(a)==mech_base(b) for a in p1 for b in p2): continue
            if any(frozenset({a,b}) in invalid_combos for a in p1 for b in p2): continue

            g1, g2 = groups.get_group(k1), groups.get_group(k2)
            c1, c2 = set(g1["적용병해충"]), set(g2["적용병해충"])

            # ← 수정된 부분: 각 농약이 최소 하나의 선택 병해충을 방제해야 함
            if not (c1 & pests): continue
            if not (c2 & pests): continue

            # 병해충 전부 방제
            if not can_control_all_pests(pests, c1, c2): continue

            names1, names2 = set(g1["상표명"]), set(g2["상표명"])
            # ← 수정된 부분: owned 비어있지 않을 때만 보유농약 필터
            if owned and not (names1 & owned or names2 & owned): continue

            result.append([
                {
                  "product": ", ".join(names1),
                  "mechanism": k1,
                  "ingredient": g1.iloc[0]["품목명"],
                  "date": g1.iloc[0]["등록일"],
                  "type": g1.iloc[0]["제형"],
                  "explanation": mechanism_info.get(k1, {}).get("explanation",""),
                },
                {
                  "product": ", ".join(names2),
                  "mechanism": k2,
                  "ingredient": g2.iloc[0]["품목명"],
                  "date": g2.iloc[0]["등록일"],
                  "type": g2.iloc[0]["제형"],
                  "explanation": mechanism_info.get(k2, {}).get("explanation",""),
                }
            ])

    return {"recommendations": result}  # ← 수정된 부분: 모든 경우 반환
