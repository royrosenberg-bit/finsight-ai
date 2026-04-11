from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import stock, news, ai, history, indices, analysts, screener, earnings, search, whymove, portfolio_analyze, alerts, compare_fundamentals, dcf

app = FastAPI(title="FinSight AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stock.router, prefix="/api")
app.include_router(news.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(history.router, prefix="/api")
app.include_router(indices.router, prefix="/api")
app.include_router(analysts.router, prefix="/api")
app.include_router(screener.router, prefix="/api")
app.include_router(earnings.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(whymove.router, prefix="/api")
app.include_router(portfolio_analyze.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(compare_fundamentals.router, prefix="/api")
app.include_router(dcf.router, prefix="/api")
