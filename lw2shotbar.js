window.onload = function () {
    hitRankArray = ["crit", "hit", "graze", "miss"];
    hitRankColors = {
        crit: "#95791b",
        hit: "#72141c",
        graze: "#468652",
        miss: "#5c6060",
    };
    hitRankFriendlyNames = {
        crit: "暴击",
        hit: "正常命中",
        graze: "擦伤",
        miss: "未命中",
    };

    intFormat = d3.format(".0f");
    decFormat = d3.format(".1f");

    d3.select(window).on("resize", draw);

    d3.select("body")
        .html("")
        .append("div")
        .attr("id", "input")
        .attr("class", "fancy-shape")
        .append("p")
        .selectAll("div")
        .data([
            { min: 0, max: 100, value: 65, text: "Aim" },
            { min: 0, max: 100, value: 0, text: "Crit" },
            { min: 0, max: 100, value: 0, text: "Dodge" },
            { min: 0, max: 100, value: 10, text: "Graze band" },
        ])
        .join("div")
        .text((d) => d.text)
        .append("input")
        .attr("type", "number")
        .attr("id", (d) => "input-" + d.text.replace(" ", "").toLowerCase())
        .attr("min", (d) => d.min)
        .attr("max", (d) => d.max)
        .attr("value", (d) => d.value)
        .on("change", draw);
    d3.select("body").append("div").attr("id", "breakdown");
    d3.select("body")
        .append("div")
        .attr("id", "output")
        .attr("class", "fancy-shape")
        .append("p");

    d3.select("body")
        .append("div")
        .attr("id", "tooltip")
        .style("position", "absolute")
        .style("transform", "translate(-50%, -100%)")
        .style("padding", "0.5em")
        .style("display", "none");

    draw();
};

function clamp(x) {
    return Math.max(0, Math.min(100, x));
}

function modifyHitDistribution(hitDistribution, modifiers) {
    let rtn = _.cloneDeep(hitDistribution);

    let breakdown = { line1: {}, line2: {}, links: [] };

    for (to of hitRankArray) {
        breakdown.line1[to] = {};
        breakdown.line1[to][to] = { value: hitDistribution[to] };
    }

    for (mod of modifiers) {
        breakdown.line1[mod.from] ??= {};
        breakdown.line1[mod.from][mod.to] ??= {};
        breakdown.line1[mod.from][mod.to].value ??= mod.value;
        breakdown.line1[mod.from][mod.to].text ??= mod.text;
        breakdown.line1[mod.from][mod.to].color ??= mod.color;

        if (mod.value > 0) {
            rtn[mod.to] += mod.value;
            rtn[mod.from] -= mod.value;
            breakdown.line1[mod.from][mod.from].value -= mod.value;
        }
        if (mod.link) {
            breakdown.links.push({ from: mod.from, to: mod.to });
        }
    }

    for (to of hitRankArray) {
        breakdown.line2[to] ??= {};
        breakdown.line2[to].value ??= rtn[to];
    }
    rtn.breakdown.push(breakdown);

    return rtn;
}

function makeInitialShotbar(aim) {
    let rtn = {
        crit: 0,
        hit: clamp(aim),
        graze: 0,
    };
    rtn.miss = 100 - rtn.hit;

    let breakdown = {
        text: `正常命中的初始概率为${intFormat(
            rtn.hit
        )}%，由命中白值决定。空白区域为未命中。`,
        line1: {},
        line2: {},
    };
    for (rank of hitRankArray) {
        breakdown.line1[rank] = {};
        breakdown.line1[rank][rank] = { value: rtn[rank] };
        breakdown.line2[rank] = { value: rtn[rank] };
    }
    rtn.breakdown = [breakdown];
    return rtn;
}

function applyGrazeBand(grazeband) {
    return (hitDistribution) => {
        let halfBandwidth = Math.min(
            grazeband,
            hitDistribution.hit,
            hitDistribution.miss
        );

        let rtn = modifyHitDistribution(hitDistribution, [
            {
                from: "hit",
                to: "graze",
                value: halfBandwidth,
                text: "擦伤带",
                link: true,
            },
            {
                from: "miss",
                to: "graze",
                value: halfBandwidth,
                text: "擦伤带",
                link: true,
            },
            { from: "hit", to: "hit", text: "剩余的正常命中" },
            { from: "miss", to: "miss", text: "剩余的未命中" },
        ]);

        let helpText;
        if (grazeband > 0) {
            if (halfBandwidth == 0) {
                helpText = `擦伤带会使部分正常命中和未命中变为擦伤，但是由于${
                    initial.hit == 0 ? "命中" : "未命中的概率"
                }为0，无法造成擦伤。`;
            } else {
                helpText = `擦伤带会使命中条中${intFormat(
                    2 * halfBandwidth
                )}%的区域变为擦伤。一半由正常命中取得，另一半由未命中取得。${
                    halfBandwidth < grazeband
                        ? ` 由于${
                              initial.hit < grazeband
                                  ? "命中"
                                  : "未命中的概率"
                          }很低，擦伤的概率一同减少。`
                        : ""
                }`;
            }
        } else {
            helpText =
                "擦伤带被设为0，所以此时命中条不会被修改。";
        }
        _.last(rtn.breakdown).text = helpText;

        return rtn;
    };
}

function applyHitPromotion(promoteChance) {
    return (hitDistribution) => {
        let rtn = modifyHitDistribution(hitDistribution, [
            {
                from: "hit",
                to: "crit",
                value: (promoteChance * hitDistribution.hit) / 100,
                text: `正常命中的${decFormat(promoteChance)}%`,
                link: true,
            },
            {
                from: "hit",
                to: "hit",
                text: `正常命中的${decFormat(100 - promoteChance)}%`,
                link: true,
            },
            {
                from: "graze",
                to: "hit",
                value: (promoteChance * hitDistribution.graze) / 100,
                text: `擦伤的${decFormat(promoteChance)}%`,
                link: true,
            },
            {
                from: "graze",
                to: "graze",
                text: `擦伤的${decFormat(100 - promoteChance)}%`,
                link: true,
            },
        ]);

        let helpText;
        if (rtn.miss == 100) {
            helpText =
                "命中升级将在此处显示，但命中概率为0。";
        } else if (promoteChance == 0) {
            helpText =
                "命中升级将在此处显示，但暴击为0且闪避不为负。";
        } else {
            helpText = `命中有${intFormat(
                promoteChance
            )}%的概率升级，取决于${
                crit > 0 && dodge < 0
                    ? "暴击与负闪避的和"
                    : crit > 0
                    ? "暴击"
                    : "负闪避"
            }。正常命中将升为暴击，擦伤将升为命中。`;
        }
        _.last(rtn.breakdown).text = helpText;

        return rtn;
    };
}

function applyHitDemotion(demoteChance) {
    return (hitDistribution) => {
        let rtn = modifyHitDistribution(hitDistribution, [
            {
                from: "crit",
                to: "crit",
                text: `暴击的${decFormat(100 - demoteChance)}%`,
                link: true,
            },
            {
                from: "crit",
                to: "hit",
                value: (hitDistribution.crit * demoteChance) / 100,
                text: `暴击的${decFormat(demoteChance)}%`,
                link: true,
            },
            {
                from: "hit",
                to: "hit",
                text: `正常命中的${decFormat(100 - demoteChance)}%`,
                link: true,
            },
            {
                from: "hit",
                to: "graze",
                value: (hitDistribution.hit * demoteChance) / 100,
                text: `正常命中的${decFormat(demoteChance)}%`,
                link: true,
            },
            {
                from: "graze",
                to: "graze",
                text: `擦伤的${decFormat(100 - demoteChance)}%`,
                link: true,
            },
            {
                from: "graze",
                to: "miss",
                value: (hitDistribution.graze * demoteChance) / 100,
                text: `擦伤的${decFormat(demoteChance)}%`,
                link: true,
            },
            { from: "miss", to: "miss", link: true },
        ]);

        let helpText;
        if (promoted.miss == 100) {
            helpText =
                "命中降级将在此处显示，但命中概率为0。";
        } else if (demoteChance == 0) {
            helpText =
                "命中降级将在此处显示，但闪避不为正。";
        } else {
            helpText = `命中有${intFormat(
                demoteChance
            )}%的概率降级，取决于闪避。暴击将降级为正常命中，正常命中将降级为擦伤，擦伤将降级为未命中。`;
        }
        _.last(rtn.breakdown).text = helpText;

        return rtn;
    };
}

function colorblend(left, right, lambda) {
    let lcol = d3.color(left);
    let rcol = d3.color(right);
    return d3.rgb(
        (1 - lambda) * lcol.r + lambda * rcol.r,
        (1 - lambda) * lcol.g + lambda * rcol.g,
        (1 - lambda) * lcol.b + lambda * rcol.b,
        (1 - lambda) * lcol.a + lambda * rcol.a
    );
}

function setLeftCoords(array) {
    let lefts =
        array.length == 0
            ? array
            : (xIter = d3.cumsum(
                  [0].concat(array.slice(0, -1).map((x) => x.value))
              ));
    return array.forEach((e, i) => (e.x = lefts[i]));
}

function draw() {
    let breakdownDiv = d3.select("#breakdown").node();
    breakdownDiv.innerHTML = "";
    let widthRatio = 0.6;
    let dims = {
        width: breakdownDiv.getClientRects()[0].width * widthRatio,
        singleHeightPx: 16,
        doubleHeightPx: 4 * 16,
    };

    // Inputs
    aim = parseInt(d3.select("#input-aim").property("value"));
    crit = parseInt(d3.select("#input-crit").property("value"));
    dodge = parseInt(d3.select("#input-dodge").property("value"));
    grazeband = parseInt(d3.select("#input-grazeband").property("value"));

    let promoteChance = Math.min(crit - Math.min(0, dodge), 100); // Negative dodge is additional crit
    let demoteChance = Math.min(Math.max(dodge, 0), 100);

    initial = makeInitialShotbar(aim);
    banded = applyGrazeBand(grazeband)(initial);
    promoted = applyHitPromotion(promoteChance)(banded);
    demoted = applyHitDemotion(demoteChance)(promoted);

    // Help texts
    d3.select("#breakdown")
        .selectAll("div")
        .data(demoted.breakdown)
        .join("div")
        .attr("class", "fancy-shape")
        .append("p")
        .text((d) => d.text)
        .append("br");

    // SVGs
    d3.select("#breakdown")
        .selectAll("div")
        .data(demoted.breakdown)
        .join("div")
        .append("svg")
        .attr("width", dims.width)
        .attr("height", (d, i) => {
            d.diff =
                demoted.breakdown[i - 1] == undefined ||
                !_.isEqual(
                    hitRankArray.map((e) => d.line2[e].value),
                    hitRankArray.map(
                        (e) => demoted.breakdown[i - 1].line2[e].value
                    )
                );
            if (!d.links) {
                return dims.singleHeightPx;
            }
            return dims.doubleHeightPx;
        })
        .style("display", (d) => (d.diff ? "" : "none"))
        .style("margin", "0 0 1em");

    // SVG rects
    d3.select("#breakdown")
        .selectAll("svg")
        .data(demoted.breakdown)
        .selectAll("g")
        .data((d) => {
            let line1 = [];
            let line2 = [];
            for (to of hitRankArray) {
                for (from of hitRankArray) {
                    rect = d.line1[from][to];
                    if (rect != undefined) {
                        rect.y = 0;
                        rect.height = dims.singleHeightPx;
                        rect.text ??= hitRankFriendlyNames[to];
                        rect.color ??= colorblend(
                            hitRankColors[from],
                            hitRankColors[to],
                            0.2
                        );
                        line1.push(rect);
                    }
                }
                rect = d.line2[to];
                rect.y = dims.doubleHeightPx - dims.singleHeightPx;
                rect.height = dims.singleHeightPx;
                rect.text = hitRankFriendlyNames[to];
                rect.color = hitRankColors[to];
                line2.push(rect);
            }
            setLeftCoords(line1);
            setLeftCoords(line2);
            line1.concat(line2).forEach((e) => {
                e.x = (e.x * dims.width) / 100;
                e.width = (e.value * dims.width) / 100;
            });
            return line1.concat(line2);
        })
        .join("rect")
        .attr("x", (d) => d.x)
        .attr("y", (d) => d.y)
        .attr("width", (d) => d.width)
        .attr("height", (d) => d.height)
        .attr("rx", 2)
        .attr("ry", 2)
        .attr("fill", (d) => d.color)
        .attr("bigtext", (d) => decFormat(d.value) + "%")
        .attr("smalltext", (d) => d.text)
        .on("mouseleave", (event) => {
            d3.select("#tooltip").style("display", "none").html("");
        })
        .on("mouseover", (event) => {
            d3.select("#tooltip")
                .style("display", "block")
                .style("text-align", "center")
                .style(
                    "left",
                    event.target.getScreenCTM().e +
                        window.pageXOffset +
                        event.target.x.animVal.value +
                        event.target.width.animVal.value / 2 +
                        "px"
                )
                .style(
                    "top",
                    event.target.getScreenCTM().f +
                        window.pageYOffset +
                        event.target.y.animVal.value -
                        1 +
                        "px"
                )
                .html("");

            d3.select("#tooltip")
                .append("span")
                .style("font-size", "1.5em")
                .text(event.target.getAttribute("bigtext"))
                .append("br");
            d3.select("#tooltip")
                .append("span")
                .text(event.target.getAttribute("smalltext"));

            let node = d3.select("#tooltip").node();
            let style = getComputedStyle(node);
            let x0 = 0;
            let x1 = parseInt(style.paddingLeft) * 0.5;
            let x2 = parseInt(style.paddingLeft) * 1.5;
            let x3 = node.offsetWidth - parseInt(style.paddingRight) * 1.5;
            let x4 = node.offsetWidth - parseInt(style.paddingRight) * 0.5;
            let x5 = node.offsetWidth;
            let y0 = 0;
            let y1 = parseInt(style.paddingTop) * 0.5;
            let y2 = parseInt(style.paddingTop) * 1.5;
            let y3 = node.offsetHeight - parseInt(style.paddingBottom) * 1.5;
            let y4 = node.offsetHeight - parseInt(style.paddingBottom) * 0.5;
            let y5 = node.offsetHeight;

            d3.select("#tooltip")
                .insert("svg")
                .style("position", "absolute")
                .style("z-index", "-1")
                .style("left", -2 + "px")
                .style("top", -2 + "px")
                .attr("width", x5 + 4)
                .attr("height", y5 + 4)
                .insert("polygon")
                .attr(
                    "points",
                    `
                    ${x0}, ${y4}
                    ${x0}, ${y2}
                    ${x2}, ${y0}
                    ${x4}, ${y0}
                    ${x5}, ${y1}
                    ${x5}, ${y3}
                    ${x3}, ${y5}
                    ${x1}, ${y5}
                    `
                )
                .attr("fill", "#040302DE")
                .attr("transform", "translate(2, 2)")
                .attr("stroke", "#98c8c8")
                .attr("stroke-width", 2);
        });

    // Links
    d3.select("#breakdown")
        .selectAll("svg")
        .data(demoted.breakdown)
        .selectAll("g")
        .data((d) => {
            if (d.links == undefined) {
                return [];
            }
            rtn = [];
            for (link of d.links) {
                rtn.push({
                    x1:
                        d.line1[link.from][link.to].x +
                        d.line1[link.from][link.to].width / 2,
                    y1:
                        d.line1[link.from][link.to].y +
                        d.line1[link.from][link.to].height,
                    x2: d.line2[link.to].x + d.line2[link.to].width / 2,
                    y2: d.line2[link.to].y,

                    display:
                        d.line1[link.from][link.to].value > 0 &&
                        d.line2[link.to].value > 0
                            ? ""
                            : "none",
                });
            }
            return rtn;
        })
        .join("path")
        .attr(
            "d",
            (d) =>
                `
                M ${d.x2} ${d.y2}
                C ${d.x2} ${(d.y1 + d.y2) / 2}
                , ${d.x1} ${(d.y1 + d.y2) / 2}
                , ${d.x1} ${d.y1}
                `
        )
        .attr("stroke", "#98c8c8")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", 4)
        .attr("stroke-linecap", "butt")
        .attr("fill", "transparent")
        .style("display", (d) => d.display);

    // Text
    d3.select("#output")
        .select("p")
        .selectAll("div")
        .data(hitRankArray)
        .join("div")
        .text((d) => `${hitRankFriendlyNames[d]}: ${decFormat(demoted[d])}%`)
        .style("text-decoration", "underline")
        .style("text-decoration-color", (d) => hitRankColors[d])
        .style("text-decoration-thickness", "0.12em");
}
