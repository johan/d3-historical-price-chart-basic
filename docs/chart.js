/**
 * Populate with an array of buy/sells for your own graph, e g:
 *
 * const mine =
 *   [ ["b", "2020-12-08",  15, 208.333]
 *   , ["s", "2021-01-08",   3, 284.860]
 *   , ["b", "2021-05-14",  27, 191.780]
 *   , ["b", "2022-10-17",  50, 201.000]
 *   ];
 *
 * …and be sure to multiply counts prior to the 2022-08-25 stock split by 3
 * and divide prices paid by the same. And, for 2020-08-31 and older, by 15
 * (cumulative stock splits). (Yahoo data is in current stock, retroacted.)
 */
const mine = [];

/** date: sum total bought/sold that day @ avg price */
let txns = {};

const loadData = d3.json('sample-data.json').then(data => {
  const chartResultsData = data.chart.result[0];
  const quoteData = chartResultsData.indicators.quote[0];

  const buys = data.txns || mine;

  for (let [t, d, n, p] of buys) {
    let { totBought = 0, totPaid = 0 } = txns[d] || {};
    n = n * (t === "b" ? 1 : -1); // negate, if sold
    const oldPaid = totPaid;
    const oldCount = totBought;
    totBought += n;
    totPaid += n * p;
    txns[d] = { totBought, totPaid, avgPrice: Math.abs(totPaid / totBought) };
  }

  /**  compute an ISO YYYY-MM-DD date from a timestamp */
  const tToYMD = (t) => (new Date(t*1e3)).toLocaleDateString("sv-SE", { formatDate: true });

  function transactions(t) {
    const iso = tToYMD(t);
    const found = txns[iso];
    return txns[tToYMD(t)];
  }

  return chartResultsData.timestamp.map((time, index) => ({
    date: new Date(time * 1000),
    high: quoteData.high[index],
    low: quoteData.low[index],
    open: quoteData.open[index],
    close: quoteData.close[index],
    volume: quoteData.volume[index],
    ...transactions(time) // for some days: totBought, totPaid, avgPrice
  }));
});

const movingAverage = (data, numberOfPricePoints) => {
  return data.map((row, index, total) => {
    const start = Math.max(0, index - numberOfPricePoints);
    const end = index;
    const subset = total.slice(start, end + 1);
    const sum = subset.reduce(((a, b) => a + b.close), 0);

    return {
      date: row.date,
      average: sum / subset.length
    };
  });
};

loadData.then(data => {
  initialiseChart(data);
});

// credits: https://brendansudol.com/writing/responsive-d3
const responsivefy = svg => {
  // get container + svg aspect ratio
  const container = d3.select(svg.node().parentNode),
    width = parseInt(svg.style('width')),
    height = parseInt(svg.style('height')),
    aspect = width / height;

  // get width of container and resize svg to fit it
  const resize = () => {
    var targetWidth = parseInt(container.style('width'));
    svg.attr('width', targetWidth);
    svg.attr('height', Math.round(targetWidth / aspect));
  };

  // add viewBox and preserveAspectRatio properties,
  // and call resize so that svg resizes on inital page load
  svg
    .attr('viewBox', '0 0 ' + width + ' ' + height)
    .attr('perserveAspectRatio', 'xMinYMid')
    .call(resize);

  // to register multiple listeners for same event type,
  // you need to add namespace, i.e., 'click.foo'
  // necessary if you call invoke this function for multiple svgs
  // api docs: https://github.com/mbostock/d3/wiki/Selections#on
  d3.select(window).on('resize.' + container.attr('id'), resize);
};

/** decode fragment JSON "query args" / feature flags */
const getHash = () => {
    try {
        return JSON.parse(decodeURIComponent(location.hash.slice(1)));
    }
    catch {
        return {};
    }
}

/** parse a date string to a Date object */
function date(t) {
  try {
    let d = new Date(Date.parse(t));
    if (isNaN(d)) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  catch {
    return null;
  }
}

const initialiseChart = data => {
  data = data.filter(
    row => row.high && row.low && row.close && row.open
  );

  let { before, after, debug, anon } = getHash();
  before = date(before);
  after = date(after);

  // filter out data based on time period
  data = data.filter(row => {
    const d = row.date;
    if (!d) return undefined;
    return (before ? d <= before : true) && (after ? d > after : true);
  });

  const margin = { top: 50, right: 50, bottom: 50, left: 50 };
  const width = window.innerWidth - margin.left - margin.right; // Use the window's width
  const height = window.innerHeight - margin.top - margin.bottom; // Use the window's height

  // find data range
  const xMin = d3.min(data, d => d.date);
  const xMax = d3.max(data, d => d.date);
  const yMin = d3.min(data, d => d.close);
  const yMax = d3.max(data, d => d.close);

  if (debug) console.info({ xMin, xMax, yMin, yMax });

  const green = '#03a678', red = '#c0392b', seeThruBrown = 'rgba(255, 220, 200, 0.75)';

  // scale using range
  const xScale = d3
    .scaleTime()
    .domain([xMin, xMax])
    .range([0, width]);

  const yScale = d3
    .scaleLinear()
    .domain([yMin - 5, yMax])
    .range([height, 0]);

  // add chart SVG to the page
  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .call(responsivefy)
    .append('g')
    .attr('transform', `translate(${margin.left}, ${margin.top})`);

  // create the axes component
  svg
    .append('g')
    .attr('id', 'xAxis')
    .attr('transform', `translate(0, ${height})`)
    .call(d3.axisBottom(xScale));

  svg
    .append('g')
    .attr('id', 'yAxis')
    .attr('transform', `translate(${width}, 0)`)
    .call(d3.axisRight(yScale));

  // renders close price line chart and moving average line chart

  // generates lines when called
  const line = d3
    .line()
    .x(d => xScale(d.date))
    .y(d => yScale(d.close));

  const movingAverageLine = d3
    .line()
    .x(d => xScale(d.date))
    .y(d => yScale(d.average))
    .curve(d3.curveBasis);

  svg
    .append('path')
    .data([data]) // binds data to the line
    .style('fill', 'none')
    .attr('id', 'priceChart')
    .attr('stroke', 'steelblue')
    .attr('stroke-width', '1.5')
    .attr('d', line);

  // calculates simple moving average over 50 days
  const movingAverageData = movingAverage(data, 49);
  svg
    .append('path')
    .data([movingAverageData])
    .style('fill', 'none')
    .attr('id', 'movingAverageLine')
    .attr('stroke', '#FF8900')
    .attr('d', movingAverageLine);

  // renders x and y crosshair
  const focus = svg
    .append('g')
    .attr('class', 'focus')
    .style('display', 'none');

  focus.append('circle').attr('r', 4.5);
  focus.append('line').classed('x', true);
  focus.append('line').classed('y', true);

  svg
    .append('rect')
    .attr('class', 'overlay')
    .attr('width', width)
    .attr('height', height)
    .on('mouseover', () => focus.style('display', null))
    .on('mouseout', () => focus.style('display', 'none'))
    .on('mousemove', generateCrosshair);

  d3.select('.overlay').style('fill', 'none');
  d3.select('.overlay').style('pointer-events', 'all');

  d3.selectAll('.focus line').style('fill', 'none');
  d3.selectAll('.focus line').style('stroke', '#67809f');
  d3.selectAll('.focus line').style('stroke-width', '1.5px');
  d3.selectAll('.focus line').style('stroke-dasharray', '3 3');

  //returs insertion point
  const bisectDate = d3.bisector(d => d.date).left;

  /* mouseover function to generate crosshair */
  function generateCrosshair() {
    //returns corresponding value from the domain
    const correspondingDate = xScale.invert(d3.mouse(this)[0]);
    //gets insertion point
    const i = bisectDate(data, correspondingDate, 1);
    const d0 = data[i - 1];
    const d1 = data[i];
    const currentPoint =
      correspondingDate - d0.date > d1.date - correspondingDate ? d1 : d0;
    focus.attr(
      'transform',
      `translate(${xScale(currentPoint.date)}, ${yScale(
        currentPoint.close
      )})`
    );

    focus
      .select('line.x')
      .attr('x1', 0)
      .attr('x2', width - xScale(currentPoint.date))
      .attr('y1', 0)
      .attr('y2', 0);

    focus
      .select('line.y')
      .attr('x1', 0)
      .attr('x2', 0)
      .attr('y1', 0)
      .attr('y2', height - yScale(currentPoint.close));

    // updates the legend to display the date, open, close,
    // high, low, and volume of the selected mouseover area
    updateLegends(currentPoint);
  }

  /* Legends */
  const updateLegends = currentData => {
    d3.selectAll('.lineLegend').remove();

    const legendKeys = Object.keys(data[0]).concat('totBought', 'avgPrice');
    const lineLegend = svg
      .selectAll('.lineLegend')
      .data(legendKeys)
      .enter()
      .append('g')
      .attr('class', 'lineLegend')
      .attr('transform', (d, i) => `translate(0, ${(1 + i) * 20})`);
    lineLegend
      .append('text')
      .text(d => {
        const v = currentData[d];
        if (d === 'date') {
          return `${d}: ${v.toLocaleDateString("sv-SE")}`;
        } else if (
          d === 'high' ||
          d === 'low' ||
          d === 'open' ||
          d === 'close'
        ) {
          return `${d}: ${v.toFixed(2)}`;
        } else if (v && (d === 'avgPrice')) {
          return `@ price: ${v.toFixed(2)}`;
        } else if (v && (d === 'totBought')) {
          return `${v < 0 ? "sold" : "bought"}: ${Math.abs(v)}`;
        } else if (v !== undefined) {
          return `${d}: ${v}`;
        }
        return "";
      })
      .style('fill', 'white')
      .attr('transform', 'translate(15,9)'); //align texts with boxes
  };

  /* Volume series bars */
  const volData = data.filter(d => d.volume !== null && d.volume !== 0);

  const yMinVolume = d3.min(volData, d => d.volume);
  const yMaxVolume = d3.max(volData, d => d.volume);

  const yVolumeScale = d3
    .scaleLinear()
    .domain([yMinVolume, yMaxVolume])
    .range([height, height * (3 / 4)]);

  svg
    .selectAll()
    .data(volData)
    .enter()
    .append('rect')
    .attr('x', d => xScale(d.date))
    .attr('y', d => yVolumeScale(d.volume))
    .attr('class', 'vol')
    .attr('fill', (d, i) => {
      if (i === 0) {
        return green;
      }
      // green bar if price is rising during that period, red if falling
      return volData[i - 1].close > d.close ? red : green;
    })
    .attr('width', 1)
    .attr('height', d => {
      return height - yVolumeScale(d.volume);
    });
  // testing axis for volume
  /*
  svg.append('g').call(d3.axisLeft(yVolumeScale));
  */


  // my transactions volume series bars: totBought, avgPrice
  const buyData = data.filter(d => d.totBought !== undefined);
  if (!buyData.length) return;

  const xMinBuy = d3.min(buyData, d => d.date);
  const xMaxBuy = d3.max(buyData, d => d.date);
  const yMinBuy = d3.min(buyData, d => Math.abs(d.totBought));
  const yMaxBuy = d3.max(buyData, d => d.totBought);
  const yBuyScale = d3
    .scaleLinear()
    .domain([yMinBuy, yMaxBuy])
    .range([0, height * 1 / 4]);

  // add horizontal red/green bars centered on date and price of sale
  // (intersected by a vertical notch for the date)
  const buySell = svg
    .selectAll()
    .data(buyData)
    .enter();

  buySell.append('rect')
    .attr('class', 'vol')
    .attr('fill', (d, i) => d.totBought >= 0 ? green : red)
    .attr('x', d => xScale(d.date))
    .attr('y', d => yScale(d.avgPrice) - 5)
    .attr('width', 1)
    .attr('height', 10);
  buySell.append('rect')
    .attr('class', 'vol')
    .attr('fill', (d, i) => d.totBought >= 0 ? green : red)
    .attr('x', d => xScale(d.date) - 0.5 * yBuyScale(Math.abs(d.totBought)))
    .attr('y', d => yScale(d.avgPrice))
    .attr('width', d => yBuyScale(Math.abs(d.totBought)))
    .attr('height', 1);

  // for a vertical top-side bar instead: (change to axisLeft below)
  buySell.append('rect')
    .attr('class', 'vol')
    .attr('fill', (d, i) => d.totBought >= 0 ? green : red)
    .attr('x', d => xScale(d.date))
    .attr('y', 0)
    .attr('width', 1)
    .attr('height', d => yBuyScale(Math.abs(d.totBought)));

  // option: change to axisTop instead?
  if (!anon) {
    svg.append('g').call(d3.axisLeft(yBuyScale));
  }

  // a total assets held at avg buy price horizontal bar
  let totals = buyData.reduce((sum, d) => ({
      totBought: sum.totBought + d.totBought,
      totPaid: sum.totPaid + d.totPaid
  }), { totBought: 0, totPaid: 0 });
  totals.avgPrice = totals.totPaid / totals.totBought;
  const myAverage = [{ date: xMinBuy, ...totals}, { date: xMaxBuy, ...totals }];

  const assetsLine = d3.line()
    .x(d => xScale(d.date))
    .y(d => yScale(d.avgPrice));

  // my average stock price paid, from first to last transaction
  svg
    .append('path')
    .data([myAverage])
    .style('fill', 'none')
    .attr('id', 'averagePricePaid')
    .attr('stroke', seeThruBrown)
    .attr('d', assetsLine);

  const myAverageLegend = svg.selectAll('.myAverageLegend')
    .data([totals])
      .enter()
      .append('g')
      .attr('class', 'myAverageLegend');

  const currValue = data[data.length - 1].close;
  const delta = (currValue / totals.avgPrice) * 100 - 100;
  const deltaText = !delta ? "" : (delta > 0 ? "+" : "") + delta.toFixed(1) + "%";
  const count = anon ? "" : `${totals.totBought} @ `;

  myAverageLegend
    .append('text')
    .text(d => `${count}${d.avgPrice.toFixed(2)} ${deltaText}`)
    .style('fill', !delta ? seeThruBrown : delta > 0 ? green : red)
    .attr('transform', (d) => `translate(${5 + xScale(xMinBuy)},${yScale(d.avgPrice) - 5})`);
};
