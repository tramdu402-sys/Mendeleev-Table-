#![windows_subsystem = "windows"]

#[allow(dead_code)]
mod elements;

use elements::ELEMENTS;
use slint::{ModelRc, SharedString, VecModel};
use std::rc::Rc;

slint::slint! {
    #[edition = "1.19"]

    export struct ElementItem {
        num: string,
        sym: string,
        ru: string,
        en: string,
        mass: string,
        cat: string,
        row: int,
        col: int,
        desc: string,
        feat: string,
    }

    export component AppWindow inherits Window {
        title: "Таблица Менделеева";
        preferred-width: 1280px;
        preferred-height: 820px;
        background: #000000;

        in property <[ElementItem]> elements;
        in property <string> error-text: "";
        in-out property <int> selected-index: -1;
        in-out property <ElementItem> selected-item: {
            num: "1",
            sym: "H",
            ru: "Водород",
            en: "Hydrogen",
            mass: "1.008",
            cat: "Неметалл",
            row: 1,
            col: 1,
            desc: "",
            feat: "",
        };

        VerticalLayout {
            padding: 14px;
            spacing: 12px;

            HorizontalLayout {
                spacing: 8px;
                alignment: center;
                Text {
                    text: "Периодическая таблица";
                    color: #f5f5f7;
                    font-size: 22px;
                    font-weight: 700;
                }
                Text {
                    text: "Менделеева";
                    color: #ff9f43;
                    font-size: 22px;
                    font-weight: 700;
                }
            }

            if root.error-text != "" : Rectangle {
                background: #1a0b0b;
                border-radius: 12px;
                border-width: 1px;
                border-color: #ff5e57;
                HorizontalLayout {
                    padding: 12px;
                    Text {
                        text: root.error-text;
                        color: #ff8a80;
                        font-size: 14px;
                        horizontal-alignment: center;
                    }
                }
            }

            Flickable {
                vertical-stretch: 1;
                content-width: 1240px;
                content-height: 776px;

                for el[idx] in root.elements : Rectangle {
                    x: (el.col - 1) * 68px + 8px;
                    y: (el.row - 1) * 76px + 8px;
                    width: 64px;
                    height: 72px;
                    border-radius: 10px;
                    background: root.selected-index == idx ? #24170c : (ta.has-hover ? #14110f : #0a0a0b);
                    border-width: root.selected-index == idx ? 1.5px : 1px;
                    border-color: (root.selected-index == idx || ta.has-hover) ? #ff9f43 : #3d2612;

                    animate background { duration: 150ms; }
                    animate border-color { duration: 150ms; }

                    ta := TouchArea {
                        clicked => {
                            root.selected-index = idx;
                            root.selected-item = el;
                        }
                    }

                    VerticalLayout {
                        padding: 5px;
                        spacing: 2px;

                        HorizontalLayout {
                            Text {
                                text: el.num;
                                color: #ff9f43;
                                font-size: 10px;
                                font-weight: 700;
                            }
                            Rectangle { horizontal-stretch: 1; }
                            Text {
                                text: el.mass;
                                color: rgb(142, 142, 147);
                                font-size: 8px;
                                overflow: elide;
                            }
                        }

                        Text {
                            text: el.sym;
                            color: #f5f5f7;
                            font-size: 18px;
                            font-weight: 700;
                        }

                        Text {
                            text: el.ru;
                            color: #e5e5ea;
                            font-size: 9px;
                            overflow: elide;
                        }

                        Text {
                            text: el.en;
                            color: rgb(142, 142, 147);
                            font-size: 7.5px;
                            overflow: elide;
                        }
                    }
                }
            }

            if root.selected-index >= 0 : Rectangle {
                background: #0a0a0b;
                border-radius: 16px;
                border-width: 1px;
                border-color: #ff9f43;

                VerticalLayout {
                    padding: 16px;
                    spacing: 10px;

                    HorizontalLayout {
                        spacing: 12px;
                        alignment: start;

                        Text {
                            text: root.selected-item.sym;
                            color: #ff9f43;
                            font-size: 28px;
                            font-weight: 800;
                        }
                        Text {
                            text: root.selected-item.ru;
                            color: #f5f5f7;
                            font-size: 20px;
                            font-weight: 700;
                            vertical-alignment: center;
                        }
                        Text {
                            text: "(" + root.selected-item.en + ")";
                            color: rgb(142, 142, 147);
                            font-size: 14px;
                            vertical-alignment: center;
                        }

                        Rectangle { horizontal-stretch: 1; }

                        Rectangle {
                            width: 32px;
                            height: 32px;
                            border-radius: 16px;
                            background: close-ta.has-hover ? #2b1a0c : #141416;
                            border-width: 1px;
                            border-color: #ff9f43;

                            Text {
                                width: 100%;
                                height: 100%;
                                text: "✕";
                                color: #ffb974;
                                font-size: 14px;
                                horizontal-alignment: center;
                                vertical-alignment: center;
                            }

                            close-ta := TouchArea {
                                clicked => {
                                    root.selected-index = -1;
                                }
                            }
                        }
                    }

                    HorizontalLayout {
                        spacing: 8px;
                        alignment: start;

                        Rectangle {
                            background: #24170c;
                            border-radius: 10px;
                            HorizontalLayout {
                                padding-left: 10px;
                                padding-right: 10px;
                                padding-top: 4px;
                                padding-bottom: 4px;
                                Text {
                                    text: "№ " + root.selected-item.num;
                                    color: #ffb974;
                                    font-size: 12px;
                                    font-weight: 600;
                                }
                            }
                        }

                        Rectangle {
                            background: #24170c;
                            border-radius: 10px;
                            HorizontalLayout {
                                padding-left: 10px;
                                padding-right: 10px;
                                padding-top: 4px;
                                padding-bottom: 4px;
                                Text {
                                    text: "Ar: " + root.selected-item.mass;
                                    color: #ffb974;
                                    font-size: 12px;
                                    font-weight: 600;
                                }
                            }
                        }

                        Rectangle {
                            background: #24170c;
                            border-radius: 10px;
                            HorizontalLayout {
                                padding-left: 10px;
                                padding-right: 10px;
                                padding-top: 4px;
                                padding-bottom: 4px;
                                Text {
                                    text: root.selected-item.cat;
                                    color: #ffb974;
                                    font-size: 12px;
                                    font-weight: 600;
                                }
                            }
                        }
                    }

                    HorizontalLayout {
                        spacing: 10px;

                        Rectangle {
                            horizontal-stretch: 1;
                            background: #050506;
                            border-radius: 10px;
                            border-width: 1px;
                            border-color: #1f1f22;

                            VerticalLayout {
                                padding: 10px;
                                spacing: 4px;
                                Text {
                                    text: "ОПИСАНИЕ";
                                    color: #ff9f43;
                                    font-size: 11px;
                                    font-weight: 700;
                                }
                                Text {
                                    text: root.selected-item.desc;
                                    color: #e5e5ea;
                                    font-size: 13px;
                                    wrap: word-wrap;
                                }
                            }
                        }

                        Rectangle {
                            horizontal-stretch: 1;
                            background: #050506;
                            border-radius: 10px;
                            border-width: 1px;
                            border-color: #1f1f22;

                            VerticalLayout {
                                padding: 10px;
                                spacing: 4px;
                                Text {
                                    text: "СВОЙСТВО И ОСОБЕННОСТЬ";
                                    color: #ff9f43;
                                    font-size: 11px;
                                    font-weight: 700;
                                }
                                Text {
                                    text: root.selected-item.feat;
                                    color: #e5e5ea;
                                    font-size: 13px;
                                    wrap: word-wrap;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

fn main() -> Result<(), slint::PlatformError> {
    let app = AppWindow::new()?;

    if ELEMENTS.is_empty() {
        app.set_error_text(SharedString::from("Ошибка: база элементов пуста."));
        return app.run();
    }

    let items: Vec<ElementItem> = ELEMENTS
        .iter()
        .map(|e| ElementItem {
            num: SharedString::from(e.num.to_string()),
            sym: SharedString::from(e.sym),
            ru: SharedString::from(e.ru),
            en: SharedString::from(e.en),
            mass: SharedString::from(e.mass),
            cat: SharedString::from(e.cat),
            row: e.row as i32,
            col: e.col as i32,
            desc: SharedString::from(e.desc),
            feat: SharedString::from(e.feat),
        })
        .collect();

    let model = Rc::new(VecModel::from(items));
    app.set_elements(ModelRc::from(model));

    app.run()
}
