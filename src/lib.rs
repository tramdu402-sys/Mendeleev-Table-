mod elements;

use elements::{Element as ChemElement, ELEMENTS};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{Document, Element, HtmlElement, KeyboardEvent};

#[wasm_bindgen(start)]
pub fn start() -> Result<(), JsValue> {
    let window = match web_sys::window() {
        Some(w) => w,
        None => return Ok(()),
    };
    let doc = match window.document() {
        Some(d) => d,
        None => return Ok(()),
    };

    let status_bar = doc.get_element_by_id("status-bar");

    if ELEMENTS.is_empty() {
        show_error(&status_bar, "Ошибка: база элементов пуста.");
        return Ok(());
    }

    let app_wrap = match require_el(&doc, "app-wrap", &status_bar) {
        Some(el) => el,
        None => return Ok(()),
    };
    let table_grid = match require_el(&doc, "table-grid", &status_bar) {
        Some(el) => el,
        None => return Ok(()),
    };
    let detail_panel = match require_el(&doc, "detail-panel", &status_bar) {
        Some(el) => el,
        None => return Ok(()),
    };
    let detail_close = match require_el(&doc, "detail-close", &status_bar) {
        Some(el) => el,
        None => return Ok(()),
    };
    let panel_body = match require_el(&doc, "panel-body", &status_bar) {
        Some(el) => el,
        None => return Ok(()),
    };
    let detail_silhouette = match require_el(&doc, "detail-silhouette", &status_bar) {
        Some(el) => el,
        None => return Ok(()),
    };
    let detail_symbol = match require_el(&doc, "detail-symbol", &status_bar) {
        Some(el) => el,
        None => return Ok(()),
    };
    let detail_name_ru = match require_el(&doc, "detail-name-ru", &status_bar) {
        Some(el) => el,
        None => return Ok(()),
    };
    let detail_name_en = match require_el(&doc, "detail-name-en", &status_bar) {
        Some(el) => el,
        None => return Ok(()),
    };
    let detail_number = match require_el(&doc, "detail-number", &status_bar) {
        Some(el) => el,
        None => return Ok(()),
    };
    let detail_mass = match require_el(&doc, "detail-mass", &status_bar) {
        Some(el) => el,
        None => return Ok(()),
    };
    let detail_category = match require_el(&doc, "detail-category", &status_bar) {
        Some(el) => el,
        None => return Ok(()),
    };
    let detail_desc = match require_el(&doc, "detail-desc", &status_bar) {
        Some(el) => el,
        None => return Ok(()),
    };
    let detail_feature = match require_el(&doc, "detail-feature", &status_bar) {
        Some(el) => el,
        None => return Ok(()),
    };

    table_grid.set_inner_html("");
    add_series_hints(&doc, &table_grid)?;

    let active_cell: Rc<RefCell<Option<Element>>> = Rc::new(RefCell::new(None));

    for (idx, el) in ELEMENTS.iter().enumerate() {
        let btn = doc.create_element("button")?;
        btn.set_attribute("type", "button")?;
        btn.set_class_name("el-cell");

        if let Some(html_btn) = btn.dyn_ref::<HtmlElement>() {
            let style = html_btn.style();
            let _ = style.set_property("grid-row", &el.row.to_string());
            let _ = style.set_property("grid-column", &el.col.to_string());
            let _ = style.set_property("animation-delay", &format!("{}ms", idx.min(90) * 5));
        }

        btn.set_inner_html(&format!(
            "<div class=\"el-top\"><span class=\"el-num\">{}</span><span class=\"el-mass\">{}</span></div>\
             <div class=\"el-sym\">{}</div>\
             <div class=\"el-names\"><span class=\"el-ru\">{}</span><span class=\"el-en\">{}</span></div>",
            el.num, el.mass, el.sym, el.ru, el.en
        ));

        let cell_ref = btn.clone();
        let active_ref = active_cell.clone();
        let app_wrap_ref = app_wrap.clone();
        let panel_ref = detail_panel.clone();
        let body_ref = panel_body.clone();
        let sil_ref = detail_silhouette.clone();
        let sym_ref = detail_symbol.clone();
        let ru_ref = detail_name_ru.clone();
        let en_ref = detail_name_en.clone();
        let num_ref = detail_number.clone();
        let mass_ref = detail_mass.clone();
        let cat_ref = detail_category.clone();
        let desc_ref = detail_desc.clone();
        let feat_ref = detail_feature.clone();

        let on_click = Closure::wrap(Box::new(move || {
            {
                let mut prev = active_ref.borrow_mut();
                if let Some(old) = prev.as_ref() {
                    let _ = old.class_list().remove_1("active");
                }
                let _ = cell_ref.class_list().add_1("active");
                *prev = Some(cell_ref.clone());
            }

            sym_ref.set_text_content(Some(el.sym));
            ru_ref.set_text_content(Some(el.ru));
            en_ref.set_text_content(Some(el.en));
            num_ref.set_text_content(Some(&format!("№ {}", el.num)));
            mass_ref.set_text_content(Some(&format!("Ar: {}", el.mass)));
            cat_ref.set_text_content(Some(el.cat));
            desc_ref.set_text_content(Some(el.desc));
            feat_ref.set_text_content(Some(el.feat));
            sil_ref.set_inner_html(&silhouette_svg(el));

            let _ = body_ref.class_list().remove_1("switching");
            if let Some(html_body) = body_ref.dyn_ref::<HtmlElement>() {
                let _ = html_body.offset_width();
            }
            let _ = body_ref.class_list().add_1("switching");

            let _ = panel_ref.class_list().add_1("open");
            let _ = panel_ref.set_attribute("aria-hidden", "false");
            let _ = app_wrap_ref.class_list().add_1("has-panel");
        }) as Box<dyn FnMut()>);

        btn.add_event_listener_with_callback("click", on_click.as_ref().unchecked_ref())?;
        on_click.forget();

        table_grid.append_child(&btn)?;
    }

    // Закрытие по кнопке ✕
    {
        let panel_ref = detail_panel.clone();
        let app_wrap_ref = app_wrap.clone();
        let active_ref = active_cell.clone();
        let on_close = Closure::wrap(Box::new(move || {
            close_panel(&panel_ref, &app_wrap_ref, &active_ref);
        }) as Box<dyn FnMut()>);
        detail_close.add_event_listener_with_callback("click", on_close.as_ref().unchecked_ref())?;
        on_close.forget();
    }

    // Закрытие по клавише Escape
    {
        let panel_ref = detail_panel.clone();
        let app_wrap_ref = app_wrap.clone();
        let active_ref = active_cell.clone();
        let on_key = Closure::wrap(Box::new(move |e: KeyboardEvent| {
            if e.key() == "Escape" {
                close_panel(&panel_ref, &app_wrap_ref, &active_ref);
            }
        }) as Box<dyn FnMut(KeyboardEvent)>);
        window.add_event_listener_with_callback("keydown", on_key.as_ref().unchecked_ref())?;
        on_key.forget();
    }

    if let Some(bar) = status_bar {
        let _ = bar.class_list().add_1("hidden");
    }

    Ok(())
}

fn require_el(doc: &Document, id: &str, status_bar: &Option<Element>) -> Option<Element> {
    match doc.get_element_by_id(id) {
        Some(el) => Some(el),
        None => {
            show_error(
                status_bar,
                &format!("Ошибка запуска: в index.html не найден блок #{}", id),
            );
            None
        }
    }
}

fn show_error(status_bar: &Option<Element>, msg: &str) {
    if let Some(bar) = status_bar {
        let _ = bar.class_list().remove_1("hidden");
        let _ = bar.class_list().add_1("error");
        bar.set_text_content(Some(msg));
    }
}

fn close_panel(panel: &Element, app_wrap: &Element, active_cell: &Rc<RefCell<Option<Element>>>) {
    let _ = panel.class_list().remove_1("open");
    let _ = panel.set_attribute("aria-hidden", "true");
    let _ = app_wrap.class_list().remove_1("has-panel");
    if let Some(old) = active_cell.borrow_mut().take() {
        let _ = old.class_list().remove_1("active");
    }
}

fn add_series_hints(doc: &Document, grid: &Element) -> Result<(), JsValue> {
    let has_6_3 = ELEMENTS.iter().any(|e| e.row == 6 && e.col == 3);
    if !has_6_3 {
        append_grid_item(doc, grid, "series-marker", "57–71", "6", "3")?;
    }

    let has_7_3 = ELEMENTS.iter().any(|e| e.row == 7 && e.col == 3);
    if !has_7_3 {
        append_grid_item(doc, grid, "series-marker", "89–103", "7", "3")?;
    }

    if let Some(la_row) = ELEMENTS.iter().find(|e| e.num == 58).map(|e| e.row) {
        let min_col = ELEMENTS
            .iter()
            .filter(|e| e.row == la_row)
            .map(|e| e.col)
            .min()
            .unwrap_or(1);
        if min_col >= 3 {
            append_grid_item(
                doc,
                grid,
                "series-label",
                "Лантаноиды",
                &la_row.to_string(),
                &format!("1 / {}", min_col),
            )?;
        }
    }

    if let Some(ac_row) = ELEMENTS.iter().find(|e| e.num == 90).map(|e| e.row) {
        let min_col = ELEMENTS
            .iter()
            .filter(|e| e.row == ac_row)
            .map(|e| e.col)
            .min()
            .unwrap_or(1);
        if min_col >= 3 {
            append_grid_item(
                doc,
                grid,
                "series-label",
                "Актиноиды",
                &ac_row.to_string(),
                &format!("1 / {}", min_col),
            )?;
        }
    }

    Ok(())
}

fn append_grid_item(
    doc: &Document,
    grid: &Element,
    class_name: &str,
    text: &str,
    row: &str,
    col: &str,
) -> Result<(), JsValue> {
    let div = doc.create_element("div")?;
    div.set_class_name(class_name);
    div.set_text_content(Some(text));
    if let Some(html_div) = div.dyn_ref::<HtmlElement>() {
        let style = html_div.style();
        let _ = style.set_property("grid-row", row);
        let _ = style.set_property("grid-column", col);
    }
    grid.append_child(&div)?;
    Ok(())
}

fn silhouette_svg(el: &ChemElement) -> String {
    let body = if el.cat == "Благородный газ" {
        r##"<path d="M36 62 C26 52 28 24 50 24 C72 24 74 52 64 62 L60 72 L40 72 Z" fill="#ff9f43" fill-opacity="0.2" stroke="#ff9f43" stroke-width="3"/>
            <line x1="42" y1="78" x2="58" y2="78" stroke="#ffb974" stroke-width="3" stroke-linecap="round"/>
            <line x1="45" y1="84" x2="55" y2="84" stroke="#ff9f43" stroke-width="3" stroke-linecap="round"/>
            <circle cx="50" cy="46" r="8" fill="#ffb974"/>"##
    } else if matches!(el.num, 1 | 7 | 8 | 9 | 17) {
        r##"<circle cx="50" cy="50" r="30" fill="none" stroke="#ff9f43" stroke-width="3" stroke-dasharray="6 4"/>
            <circle cx="50" cy="50" r="18" fill="#ff9f43" fill-opacity="0.22" stroke="#ffb974" stroke-width="2"/>
            <circle cx="38" cy="40" r="4" fill="#ffb974"/>
            <circle cx="63" cy="57" r="3" fill="#ff9f43"/>"##
    } else if matches!(el.num, 43 | 61) || el.num >= 84 {
        r##"<circle cx="50" cy="50" r="8" fill="#ff9f43"/>
            <path d="M50 50 L32 22 A34 34 0 0 1 68 22 Z" fill="#ff9f43" fill-opacity="0.75"/>
            <path d="M50 50 L82 54 A34 34 0 0 1 64 81 Z" fill="#ff9f43" fill-opacity="0.75"/>
            <path d="M50 50 L36 81 A34 34 0 0 1 18 54 Z" fill="#ff9f43" fill-opacity="0.75"/>
            <circle cx="50" cy="50" r="12" fill="#050505"/>
            <circle cx="50" cy="50" r="6" fill="#ffb974"/>"##
    } else if matches!(el.num, 31 | 35 | 80) {
        r##"<path d="M50 16 C50 16 74 46 74 62 A24 24 0 0 1 26 62 C26 46 50 16 50 16 Z" fill="#ff9f43" fill-opacity="0.25" stroke="#ff9f43" stroke-width="3"/>
            <path d="M38 62 A12 12 0 0 0 46 74" fill="none" stroke="#ffb974" stroke-width="3" stroke-linecap="round"/>"##
    } else if matches!(el.num, 5 | 6 | 14 | 32) {
        r##"<polygon points="50,14 78,38 50,86 22,38" fill="#ff9f43" fill-opacity="0.22" stroke="#ff9f43" stroke-width="3"/>
            <polyline points="22,38 50,48 78,38" fill="none" stroke="#ffb974" stroke-width="2"/>
            <line x1="50" y1="14" x2="50" y2="86" stroke="#ffb974" stroke-width="2"/>"##
    } else if el.num == 3 {
        r##"<rect x="32" y="24" width="36" height="58" rx="6" fill="#ff9f43" fill-opacity="0.18" stroke="#ff9f43" stroke-width="3"/>
            <rect x="42" y="16" width="16" height="8" rx="2" fill="#ff9f43"/>
            <polygon points="53,34 40,54 50,54 47,70 60,48 50,48" fill="#ffb974"/>"##
    } else if matches!(el.num, 26 | 27 | 28 | 60) {
        r##"<path d="M30 24 V56 A20 20 0 0 0 70 56 V24 H58 V56 A8 8 0 0 1 42 56 V24 Z" fill="#ff9f43" fill-opacity="0.25" stroke="#ff9f43" stroke-width="3"/>
            <line x1="30" y1="36" x2="42" y2="36" stroke="#ffb974" stroke-width="3"/>
            <line x1="58" y1="36" x2="70" y2="36" stroke="#ffb974" stroke-width="3"/>"##
    } else if el.cat.contains("металл") || el.cat == "Лантаноид" {
        r##"<polygon points="22,68 34,36 66,36 78,68" fill="#ff9f43" fill-opacity="0.24" stroke="#ff9f43" stroke-width="3"/>
            <line x1="36" y1="46" x2="64" y2="46" stroke="#ffb974" stroke-width="2.5" stroke-linecap="round"/>"##
    } else {
        r##"<ellipse cx="50" cy="50" rx="36" ry="14" fill="none" stroke="#ff9f43" stroke-width="2.5" transform="rotate(30 50 50)"/>
            <ellipse cx="50" cy="50" rx="36" ry="14" fill="none" stroke="#ff9f43" stroke-width="2.5" transform="rotate(-30 50 50)"/>
            <ellipse cx="50" cy="50" rx="36" ry="14" fill="none" stroke="#ffb974" stroke-width="2" transform="rotate(90 50 50)"/>
            <circle cx="50" cy="50" r="8" fill="#ff9f43"/>"##
    };

    format!(
        r##"<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="{}">{}</svg>"##,
        el.ru, body
    )
}
