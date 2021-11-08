let USER_SPEED = "slow",
    MINS_PER_TIMER = 10,
    RADIUS_BUFFER = 0.5;

let width = 780,
    height = 800,
    padding = 1,
    maxRadius = 3,
    curr_minute = 0;

function scale(x) {
    return (x * 2) + 1
}

/* Old scale function for total carbon amounts
function scale(x) {
    // Max carbon reading is 59.211
    return 2 * Math.log( ((Math.exp(5) - Math.exp(0.5)) / 2.193 * x) + Math.exp(0.5))
}*/

var modeCodes = [
    { "index": "0", "short": "Active Transport", "desc": "Walking, Cycling, Scooter" },
    { "index": "1", "short": "Public Transport", "desc": "Bus, Train, Tram, Underground" },
    { "index": "2", "short": "Driving", "desc": "Car, taxi" },
    { "index": "3", "short": "Other", "desc": "Other modes" },
    { "index": "4", "short": "Not travelling", "desc": "Not travelling" },
];


var purposeCodes = [
    { "index": "0", "short": "Commuting", "desc": "Travelling to or from work" },
    { "index": "1", "short": "Work related", "desc": "Trips relating to work (but not to/from work)" },
    { "index": "2", "short": "Leisure", "desc": "Travelling for leisure" },
    { "index": "3", "short": "Education", "desc": "Travelling to or from place of study" },
    { "index": "4", "short": "Shopping", "desc": "Shopping or Personal Business" },
    { "index": "5", "short": "Other", "desc": "Travelling for a purpose not captured here" },
    { "index": "6", "short": "Not travelling", "desc": "Not travelling" },
];

var carbon_codes = [0, 0.5, 1, 1.5, 2];

var speeds = { "slow": 2250, "medium": 1500, "fast": 750 };

var colours = {
    "0": "#00a020",
    "1": "#ffd059",
    "2": "#be8fff",
    "3": "#996e37",
    "4": "#bebebe",
}

// Activity to put in centre of circle arrangement
let centrePurpose = "Not travelling",
    centrePoint = { "x": 380, "y": 365 };

// Coordinates for activities
var foci = {};

purposeCodes.forEach(function (code, i) {
    if (code.desc == centrePurpose) {
        foci[code.index] = centrePoint;
    } else {
        var theta = 2 * Math.PI / (purposeCodes.length - 1);
        foci[code.index] = { x: 210 * Math.cos(i * theta) + centrePoint.x, y: 210 * Math.sin(i * theta) + centrePoint.y };
    }
});

// Start the SVG
var svg = d3.select("#chart").append("svg")
    .attr("width", width)
    .attr("height", height);

var carbonLegend = d3.select("#carbon").append("svg")
    .attr("width", 300)
    .attr("height", 300);

let modeLegend = d3.select('#mode').append("svg")
    .attr("width", 300)
    .attr("height", 300);

d3.json("carbon_sim_data.json").then(function (data) {
    let sched_objs = [];
    data.forEach(function (d) {
        var activities = [];
        for (let i in d) {
            let activity = d[i];
            activities.push({ 'duration': Number(activity['duration']), 'mode': activity['mode'], 'purpose': +activity['purpose'], 'carbon': Number(activity['carbon']) });
        }
        sched_objs.push(activities);
    });
    // Used for percentages by minute
    var purpose_counts = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
    var mode_counts = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0 };
    var carbon_by_purpose = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
    var carbon_by_mode = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0 };
    var total_carbon = 0;
    var total_travelling = 0;

    // A node for each person's schedule
    var nodes = sched_objs.map(function (o, i) {
        var purpose = o[0].purpose;
        purpose_counts[purpose] += 1;
        var mode = o[0].mode;
        mode_counts[mode] += 1;
        var carbon = o[0].carbon;
        carbon_by_purpose[purpose] += carbon;
        carbon_by_mode[mode] += carbon;
        total_carbon += carbon;
        if (mode != 4) {
            total_travelling += 1;
        }
        var init_x = foci[purpose].x + (Math.random() - 0.5);
        var init_y = foci[purpose].y + (Math.random() - 0.5);
        return {
            purpose: purpose,
            mode: mode,
            carbon: carbon,
            radius: scale(carbon),
            x: init_x,
            y: init_y,
            colour: colours[mode],
            moves: 0,
            next_move_time: o[0].duration,
            sched: o,
        }
    });

    var simulation = d3.forceSimulation(nodes)
        .force('x', d3.forceX((d) => foci[d.purpose].x))
        .force('y', d3.forceY((d) => foci[d.purpose].y))
        .force('collide', d3.forceCollide().radius((d) => d.radius + RADIUS_BUFFER))
        .alpha(0.25)
        .alphaDecay(0)
        .on("tick", tick);

    var circles = svg.selectAll("circle")
        .data(nodes)
        .enter().append("circle")
        .attr("cx", (d) => d.x)
        .attr("cy", (d) => d.y)
        .attr("r", (d) => d.radius)
        .style("fill", (d) => d.colour)
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended));

    function dragstarted(d) {
        if (!d3.event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.cx;
        d.fy = d.cy;
    }

    function dragged(d) {
        d.fx = d3.event.cx;
        d.fy = d3.event.cy;
    }

    function dragended(d) {
        if (!d3.event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    function tick() {
        circles.attr("cx", (d) => d.x)
            .attr("cy", (d) => d.y);
    }

    var t;
    // Update nodes based on activity and duration
    function timer() {
        // Updates time
        curr_minute += MINS_PER_TIMER;
        var true_minute = curr_minute % 1440;
        d3.select("#current_time").text(minutesToTime(true_minute));

        // Updates nodes
        nodes.forEach(function (n, i) {
            curr_moves = n.moves;
            if (n.next_move_time <= curr_minute + 2) {
                if (n.moves == n.sched.length - 1) {
                    curr_moves = 0;
                } else {
                    curr_moves += 1;
                }
                // Subtract from current activity count
                purpose_counts[n.purpose] -= 1;
                mode_counts[n.mode] -= 1;
                carbon_by_mode[n.mode] -= n.carbon;
                carbon_by_purpose[n.purpose] -= n.carbon;
                total_carbon -= n.carbon
                if (n.mode != 4) {
                    total_travelling -= 1;
                }

                // Move on to next activity
                n.purpose = n.sched[curr_moves].purpose;
                n.mode = n.sched[curr_moves].mode;
                n.carbon = n.sched[curr_moves].carbon;

                // Add to new activity count
                purpose_counts[n.purpose] += 1;
                mode_counts[n.mode] += 1;
                carbon_by_mode[n.mode] += n.carbon;
                carbon_by_purpose[n.purpose] += n.carbon;
                total_carbon += n.carbon
                if (n.mode != 4) {
                    total_travelling += 1;
                }

                n.moves = curr_moves;
                // Done by simulation - doing it here overwrites simulation's effect!
                //n.x = foci[n.purpose].x;
                //n.y = foci[n.purpose].y;
                n.radius = scale(n.carbon);
                n.colour = colours[n.mode];

                n.next_move_time += n.sched[n.moves].duration;
            }
        })

        // Updates simulation centriods and sizes
        simulation.force("x", d3.forceX((d) => foci[d.purpose].x))
            .force('y', d3.forceY((d) => foci[d.purpose].y))
            .force('collide', d3.forceCollide().radius((d) => d.radius + RADIUS_BUFFER));
        // Update radius and colour of nodes - this only changes at timer
        circles.transition().duration(300).attr("r", function (d) { return d.radius; })
            .style("fill", function (d) { return d.colour; });

        // Updates figures
        label.selectAll("tspan.actpct")
            .text(function (d) {
                var text = readablePercent(purpose_counts[d.index], nodes.length);
                // No travel-only percent on non travelling purpose
                if (d.index != 6) {
                    text += " (" + readablePercent(purpose_counts[d.index], total_travelling) + ")";
                }
                return text;
            });
        label.selectAll("tspan.actcarpct")
            .text(function (d) {
                return Math.round(carbon_by_purpose[d.index]) + "kg CO2e"
                //return readablePercent(carbon_by_purpose[d.index], total_carbon) + " total CO2e"
            });

        // Updates mode percentages
        modeLabel.selectAll("tspan.modepct")
            .text(function (d) {
                var text = readablePercent(mode_counts[d.index], nodes.length);
                if (d.desc != centrePurpose) {
                    text += " (" + readablePercent(mode_counts[d.index], total_travelling) + ")"
                }
                return text;
            });
        modeLabel.selectAll("tspan.modecarpct")
            .text(function (d) {
                return readablePercent(carbon_by_mode[d.index], total_carbon) + " total CO2e";
            });

        // Updates carbon total
        carbonTotal.selectAll("tspan.carbonamt").text(Math.round(total_carbon) + " kg");

        // Sets recurring timeout
        t = d3.timeout(timer, speeds[USER_SPEED]);
    }
    t = d3.timeout(timer, speeds[USER_SPEED]);

    // Activity labels
    var label = svg.selectAll("text")
        .data(purposeCodes)
        .enter().append("text")
        .attr("class", "actlabel")
        .attr("x", function (d, i) {
            if (d.desc == centrePurpose) {
                return centrePoint.x;
            } else {
                var theta = 2 * Math.PI / (purposeCodes.length - 1);
                return 320 * Math.cos(i * theta) + centrePoint.x;
            }

        })
        .attr("y", function (d, i) {
            if (d.desc == centrePurpose) {
                return centrePoint.y;
            } else {
                var theta = 2 * Math.PI / (purposeCodes.length - 1);
                // Extra 20 pixels to ensure 
                return 320 * Math.sin(i * theta) + centrePoint.y + 20;
            }

        });

    label.append("tspan")
        .attr("x", function () { return d3.select(this.parentNode).attr("x"); })
        // .attr("dy", "1.3em")
        .attr("text-anchor", "middle")
        .text(function (d) {
            return d.short;
        });
    label.append("tspan")
        .attr("dy", "1.3em")
        .attr("x", function () { return d3.select(this.parentNode).attr("x"); })
        .attr("text-anchor", "middle")
        .attr("class", "actpct")
        .text(function (d) {
            return readablePercent(purpose_counts[d.index], nodes.length) + " (" +
                readablePercent(purpose_counts[d.index], total_travelling) + ")";
            //return purpose_counts[d.index] + "%";
        });
    label.append("tspan")
        .attr("dy", "1.3em")
        .attr("x", function () { return d3.select(this.parentNode).attr("x"); })
        .attr("text-anchor", "middle")
        .attr("class", "actcarpct")
        .text(function (d) {
            return Math.round(carbon_by_purpose[d.index]) + "kg CO2e"
            //return readablePercent(carbon_by_purpose[d.index], total_carbon) + " total CO2e"
        });

    var modeLabel = modeLegend.selectAll("text").data(modeCodes).enter().append("text").attr("class", "modelabel")
        .attr("x", 110)
        .attr("y", function (d, i) {
            if (d.desc == centrePurpose) {
                return 20;
            } else {
                return 85 + (65 * i);
            }
        });
    modeLabel.append("tspan")
        .attr("x", function () { return d3.select(this.parentNode).attr("x"); })
        // .attr("dy", "1.3em")
        .attr("text-anchor", "middle")
        .text(function (d) {
            return d.short;
        });
    modeLabel.append("tspan")
        .attr("dy", "1.3em")
        .attr("x", function () { return d3.select(this.parentNode).attr("x"); })
        .attr("text-anchor", "middle")
        .attr("class", "modepct")
        .text(function (d) {
            return readablePercent(mode_counts[d.index], nodes.length) + " (" +
                readablePercent(mode_counts[d.index], total_travelling) + ")";
            //return mode_counts[d.index] + "%";
        });
    modeLabel.append("tspan")
        .attr("dy", "1.3em")
        .attr("x", function () { return d3.select(this.parentNode).attr("x"); })
        .attr("text-anchor", "middle")
        .attr("class", "modecarpct")
        .text(function (d) {
            return readablePercent(carbon_by_mode[d.index], total_carbon) + " total CO2e"
            //return carbon_by_mode[d.index] + " total CO2e"
            //return mode_counts[d.index] + "%";
        });

    var modeDots = modeLegend.selectAll("circle").data(modeCodes).enter().append("circle")
        .attr("cx", 215)
        .attr("cy", function (d, i) {
            if (d.desc == centrePurpose) {
                return 30;
            } else {
                return 95 + (65 * i);
            }
        }).attr("r", 5).style("fill", function (d, i) { return colours[i]; });

    var carbonTotal = carbonLegend.append("text").attr("class", "carbontotal")
        .attr("x", 130).attr("y", 50);
    carbonTotal.append("tspan").attr("x", function () { return d3.select(this.parentNode).attr("x"); })
        .attr("text-anchor", "middle").text("Total CO2e this 30min");
    carbonTotal.append("tspan")
        .attr("dy", "1.3em")
        .attr("x", function () { return d3.select(this.parentNode).attr("x"); })
        .attr("text-anchor", "middle")
        .attr("class", "carbonamt")
        .text(total_carbon + "kg");
    carbonTotal.append("tspan")
        .attr("dy", "3em")
        .attr("x", function () { return d3.select(this.parentNode).attr("x"); })
        .attr("text-anchor", "middle")
        .text("CO2e emissions per 30min:");

    var carbonDots = carbonLegend.selectAll("circle").data(carbon_codes).enter().append("circle")
        .attr("cx", function (d, i) {
            return 50 + (40 * i)
        })
        .attr("cy", 160)
        .attr("r", function (d) { return scale(d) }).style("fill", "#000000");

    var carbon_codes2 = ["0", "0", "0.5", "1", "1.5", "2"];
    var carbonLabel = carbonLegend.selectAll("text").data(carbon_codes2).enter().append("text").attr("text-anchor", "middle").attr("class", "modelabel")
        .attr("x", function (d, i) {
            return 10 + (40 * i);
        })
        .attr("y", 140)
        .text(function (d) {
            //console.log(d);
            return d + "kg"
        });

    // Speed toggle
    d3.selectAll(".togglebutton")
        .on("click", function () {
            if (d3.select(this).attr("data-val") == "slow") {
                d3.select(".slow").classed("current", true);
                d3.select(".medium").classed("current", false);
                d3.select(".fast").classed("current", false);
            } else if (d3.select(this).attr("data-val") == "medium") {
                d3.select(".slow").classed("current", false);
                d3.select(".medium").classed("current", true);
                d3.select(".fast").classed("current", false);
            }
            else {
                d3.select(".slow").classed("current", false);
                d3.select(".medium").classed("current", false);
                d3.select(".fast").classed("current", true);
            }

            USER_SPEED = d3.select(this).attr("data-val");
        });
});

// Output readable percent based on count.
function readablePercent(n, numNodes) {

    var pct = 100 * n / numNodes;
    if (pct < 1 && pct > 0) {
        pct = "<1%";
    } else {
        pct = Math.round(pct) + "%";
    }

    return pct;
}

// Minutes to time of day. Data is minutes from 4am.
function minutesToTime(m) {
    var minutes = (m + (4 * 60)) % 1440;
    var hh = Math.floor(minutes / 60);
    var ampm;
    if (hh > 12) {
        hh = hh - 12;
        ampm = "pm";
    } else if (hh == 12) {
        ampm = "pm";
    } else if (hh == 0) {
        hh = 12;
        ampm = "am";
    } else {
        ampm = "am";
    }
    var mm = minutes % 60;
    if (mm < 10) {
        mm = "0" + mm;
    }

    return hh + ":" + mm + ampm
}

