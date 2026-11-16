import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, Search, Sparkles, X } from "lucide-react";
import { suggestionsForValue, shouldFetchRemoteSuggestions } from "./search-suggestions.js";

function comparableQuestion(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("et")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export default function SearchForm({ initialValue = "", onSearch, busy, variant = "hero", inputRef: providedInputRef, contextQuery = "" }) {
  const listboxId = useId();
  const internalInputRef = useRef(null);
  const inputRef = providedInputRef || internalInputRef;
  const [value, setValue] = useState(initialValue);
  const [focused, setFocused] = useState(false);
  const [remoteSuggestions, setRemoteSuggestions] = useState({ query: "", items: [] });
  const [activeIndex, setActiveIndex] = useState(-1);
  const suggestionRequestRef = useRef({ id: 0, controller: null });
  const trimmedValue = value.trim();
  const contextualField = Boolean(contextQuery)
    && (!trimmedValue || comparableQuestion(trimmedValue) === comparableQuestion(contextQuery));
  const suggestionQuery = contextualField ? contextQuery : trimmedValue;

  useEffect(() => {
    setValue(initialValue);
    setActiveIndex(-1);
  }, [initialValue]);

  useEffect(() => {
    setActiveIndex(-1);
    suggestionRequestRef.current.controller?.abort();
    const requestId = suggestionRequestRef.current.id + 1;
    if (!shouldFetchRemoteSuggestions(suggestionQuery)) {
      suggestionRequestRef.current = { id: requestId, controller: null };
      setRemoteSuggestions({ query: "", items: [] });
      return undefined;
    }
    const controller = new AbortController();
    suggestionRequestRef.current = { id: requestId, controller };
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: suggestionQuery }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (response.ok
          && Array.isArray(data.suggestions)
          && suggestionRequestRef.current.id === requestId) {
          setActiveIndex(-1);
          setRemoteSuggestions({ query: suggestionQuery, items: data.suggestions });
        }
      } catch (error) {
        if (error.name !== "AbortError" && suggestionRequestRef.current.id === requestId) {
          setActiveIndex(-1);
          setRemoteSuggestions({ query: "", items: [] });
        }
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      if (suggestionRequestRef.current.id === requestId) {
        suggestionRequestRef.current = { id: requestId, controller: null };
      }
    };
  }, [suggestionQuery]);

  const suggestions = useMemo(
    () => suggestionsForValue(suggestionQuery, remoteSuggestions, 5),
    [remoteSuggestions, suggestionQuery],
  );

  const chooseSuggestion = (suggestion) => {
    setValue(suggestion.value);
    setFocused(false);
    setActiveIndex(-1);
    onSearch(suggestion.value);
  };

  const submit = (event) => {
    event.preventDefault();
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      chooseSuggestion(suggestions[activeIndex]);
      return;
    }
    if (value.trim()) {
      suggestionRequestRef.current.controller?.abort();
      setFocused(false);
      setActiveIndex(-1);
      onSearch(value.trim());
    }
  };

  const handleKeyDown = (event) => {
    if (!suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFocused(true);
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setFocused(true);
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === "Escape") {
      event.preventDefault();
      setFocused(false);
      setActiveIndex(-1);
    }
  };

  return (
    <form className={`search-form search-form--${variant}`} onSubmit={submit} role="search">
      <div className="search-control">
        <Search aria-hidden="true" className="search-control__leading" size={21} />
        <input
          ref={inputRef}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          aria-autocomplete="list"
          aria-controls={focused && suggestions.length ? listboxId : undefined}
          aria-expanded={Boolean(focused && suggestions.length)}
          aria-label="Otsi keskkonnaandmeid"
          autoComplete="off"
          onBlur={() => window.setTimeout(() => setFocused(false), 140)}
          onChange={(event) => {
            setValue(event.target.value);
            setActiveIndex(-1);
            setFocused(true);
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder="Küsi keskkonnaandmete kohta …"
          role="combobox"
          value={value}
        />
        {value ? (
          <button className="icon-button search-control__clear" onClick={() => {
            setValue("");
            setActiveIndex(-1);
            inputRef.current?.focus();
          }} type="button" aria-label="Tühjenda otsing">
            <X aria-hidden="true" size={19} />
          </button>
        ) : null}
        <button
          aria-label={busy ? "Otsin" : "Küsi"}
          className="search-submit"
          disabled={busy || !value.trim()}
          type="submit"
        >
          {busy ? <LoaderCircle aria-hidden="true" className="spin" size={19} /> : <Sparkles aria-hidden="true" size={18} />}
          <span>{busy ? "Otsin" : "Küsi"}</span>
        </button>
        {!busy && focused && suggestions.length ? (
          <div className="search-suggestions">
            <div className="search-suggestions__title" id={`${listboxId}-label`}>Soovitatud päringud</div>
            <div aria-labelledby={`${listboxId}-label`} id={listboxId} role="listbox">
              {suggestions.map((suggestion, index) => (
                <button
                  aria-selected={index === activeIndex}
                  className={index === activeIndex ? "active" : ""}
                  id={`${listboxId}-option-${index}`}
                  key={suggestion.value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseSuggestion(suggestion)}
                  role="option"
                  tabIndex={-1}
                  type="button"
                >
                  <Search aria-hidden="true" size={16} />
                  <span>{suggestion.value}</span>
                  {suggestion.count ? <small>{suggestion.count} vastet</small> : null}
                  <ArrowRight aria-hidden="true" size={15} />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {variant === "hero" ? (
        <p className="search-form__hint">Vastus esmalt, kasutatud ametlikud allikad kohe järel</p>
      ) : null}
    </form>
  );
}
