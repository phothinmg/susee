# frozen_string_literal: true

require "jekyll"
require "nokogiri"
require "json"
require "open3"

def shiki_highlight(code, lang)
  script_path = File.expand_path("../node/shiki.js", __dir__)
  input = JSON.generate({ code: code, lang: lang })
  stdout, stderr, status = Open3.capture3("node", script_path, stdin_data: input)
  raise "Shiki highlight failed: #{stderr}" unless status.success?

  stdout
end

def create_wrapper(lan, code)
  lang = lan.capitalize
  highlighted_code = shiki_highlight(code, lan)
  <<~HTML
    <div class="shiki_code" data-highlighter>
      <div class="code_head">
        <span>#{lan}</span>
        <button type="button" aria-label="Highlight-#{lang}" data-copy-btn></button>
      </div>
      #{highlighted_code}
    </div>
  HTML
end

def replace_elements(node)
  code_el = node.at_css('> code[class^="language-"]')
  return unless code_el

  code = code_el.text
  lang = code_el["class"]
         &.split
         &.find { |class_name| class_name.start_with?("language-") }
         &.delete_prefix("language-")
  fragment = Nokogiri::HTML::DocumentFragment.parse(create_wrapper(lang, code))
  node.replace(fragment)
end

module Jekyll
  # module Jekyll::ShikiCodeBlock
  module ShikiCodeBlock
    def shiki_code_block(html_content)
      doc = Nokogiri::HTML::DocumentFragment.parse(html_content)
      elements = doc.css("pre").select { |pre| pre.at_css('> code[class^="language-"]') }
      return html_content if elements.empty?

      elements.each { |node| replace_elements(node) }
      doc.to_html
    end
  end
end

Liquid::Template.register_filter(Jekyll::ShikiCodeBlock)
