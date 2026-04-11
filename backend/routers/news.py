from fastapi import APIRouter, HTTPException
import yfinance as yf

router = APIRouter()


@router.get("/news/{symbol}")
def get_news(symbol: str):
    ticker = yf.Ticker(symbol.upper())
    raw_news = ticker.news

    if raw_news is None:
        raise HTTPException(status_code=404, detail=f"No news found for '{symbol}'")

    articles = []
    for item in raw_news[:8]:
        content = item.get("content", {})
        title = content.get("title") or item.get("title", "")

        # Try multiple URL fields in order of preference
        url = (
            content.get("canonicalUrl", {}).get("url")
            or content.get("clickThroughUrl", {}).get("url")
            or item.get("link", "")
            or item.get("url", "")
        )

        # Only keep URLs that are valid http links
        if url and not url.startswith("http"):
            url = ""

        publisher = content.get("provider", {}).get("displayName") or item.get("publisher", "")
        pub_date = content.get("pubDate") or item.get("providerPublishTime", "")

        if title:
            articles.append({
                "title": title,
                "url": url,
                "publisher": publisher,
                "published_at": pub_date,
            })

    return {"symbol": symbol.upper(), "articles": articles}
