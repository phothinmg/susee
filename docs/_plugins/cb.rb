# frozen_string_literal: true

require "jekyll"
require "nokogiri"
require "json"
require "open3"
require "pathname"

def shiki_plugin_config(site)
  return {} unless site

  site.config.fetch("shiki_code_block", {})
end

def resolve_shiki_bundle_path(site)
  bundle_path = shiki_plugin_config(site)["bundle_path"]
  return File.expand_path("../node/shiki.js", __dir__) unless bundle_path
  return bundle_path if Pathname.new(bundle_path).absolute?

  File.expand_path(bundle_path, site.source)
end

def shiki_highlight(code, lang, site)
  plugin_config = shiki_plugin_config(site)
  script_path = resolve_shiki_bundle_path(site)
  input = JSON.generate({
    code: code,
    lang: lang,
    theme: plugin_config["theme"]
  }.compact)
  stdout, stderr, status = Open3.capture3("node", script_path, stdin_data: input)
  raise "Shiki highlight failed: #{stderr}" unless status.success?

  stdout
end

def create_wrapper(lan, code, site)
  lang = lan.capitalize
  highlighted_code = shiki_highlight(code, lan, site)
  <<~HTML
    <div class="shiki_code" data-shiki-highlighter>
      <div class="code_head">
        <span>#{lan}</span>
        <button type="button" aria-label="Highlight-#{lang}" data-copy-btn></button>
      </div>
      #{highlighted_code}
    </div>
  HTML
end

def replace_elements(node, site)
  code_el = node.at_css('> code[class^="language-"]')
  return unless code_el

  code = code_el.text
  lang = code_el["class"]
         &.split
         &.find { |class_name| class_name.start_with?("language-") }
         &.delete_prefix("language-")
  fragment = Nokogiri::HTML::DocumentFragment.parse(create_wrapper(lang, code, site))
  node.replace(fragment)
end

module Jekyll
  # module Jekyll::ShikiCodeBlock
  module ShikiCodeBlock
    def self.full_document?(html_content)
      html_content.match?(/\A\s*(<!doctype\s+html|<html\b)/i)
    end

    def self.transform_html(html_content, site)
      doc = if full_document?(html_content)
              Nokogiri::HTML.parse(html_content)
            else
              Nokogiri::HTML::DocumentFragment.parse(html_content)
            end
      elements = doc.css("pre").select { |pre| pre.at_css('> code[class^="language-"]') }
      return html_content if elements.empty?

      elements.each { |node| replace_elements(node, site) }
      doc.to_html
    end
  end
end

Jekyll::Hooks.register :pages, :post_render do |page|
  next unless page.output_ext == ".html"

  page.output = Jekyll::ShikiCodeBlock.transform_html(page.output, page.site)
end

Jekyll::Hooks.register :documents, :post_render do |document|
  next unless document.output_ext == ".html"

  document.output = Jekyll::ShikiCodeBlock.transform_html(document.output, document.site)
end
